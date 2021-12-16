
const queuedcall = require( "./queuedcall.js" )
/*
Some thoughts

Remove any sub classes. Everything needs to be handled in here.

Even that presents problems as we have different queues for the same
domain may need present a call to an agent.

If an agent is in q1 and q2 and a call with a higher priority appears
in q2 then this is the queue it should get presented with.

If agent1 hangs up then this can trigger a new call to that agent.

But agent1 could be in a call queue q1 and q2 - so - which one. It should be

Priority first, then age of call.
*/

/**
  @typedef {Object} fifo.options
  @property {number} [uactimeout=60000] How long we ring a phone for before retrying
  @property {number} [uacretrylag=1000] after uactimeout how long before retry
  @property {number} [wrapup=10000] once an agent has spoken - how long before another call is presented
*/
const defaultoptions = {
  "uactimeout": 60000,
  "uacretrylag": 1000,
  "wrapup": 10000
}

/**
A fifo (first in first out) maintains multiple queues (also fifos)
for different strategies and priorities.
*/
class fifo {
  constructor( options ) {

    /**
    10 different priorities
    @private
    */
    this._fifos = []
    for( let i = 0; i < 10 ; i++ ) this._fifos.push( [] )

    /**
    Map by uuid - which is related to fifos
    @private
    */
    this._calls = new Map()

    /**
    So we don't have to sum calls in fifos
    @private
    */
    this._callcount = 0

    /**
    Array of strings i.e. [ "1000@dummy.com" ]
    @private
    */
    this._agents = {}

    /**
    _ringall or _enterprise
    @private
    */
    this._callagents = this._ringall.bind( this )

    /**
    Store our options and set required defaults
    @private
    */
    this._options = { ...defaultoptions, ...options }
  }

  /**
  Queue a call with options
  @param { object } options
  @param { call } options.call
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue (S)
  @param { number } [ options.priority = 5 ] - the priority - 1-10
  @returns { Promise< string > } - with a string with the last state (confirm|abandoned|timeout)
  */
  queue( options ) {

    /* sanity */
    if( !Number.isInteger( options.priority ) ||
        options.priority < 1 ||
        options.priority >= this._fifos.length ) {
      options.priority = 5
    }

    /* register for a hungup */
    options.call.on( "call.hangup", this._hangup.bind( this ) )

    /* Wrap our call with extra info */
    let qc = queuedcall.create( this, options, this._onqueuetimeout.bind( this ) )

    this._callcount++
    this._fifos[ options.priority - 1 ].push( options.call.uuid )
    this._calls.set( options.call.uuid, qc )

    /*
    We will resolve when we have an agent we are able to bridge to.
    If we are abandoned or timeout then an expcetion is thrown
    so we return from this function.
    */
    return qc.wait()
  }

  /**
  Return the next queued call which would be connected.
  @param { boolean } [ pop = false ] whether to remove the call from our queue
  @private
  @returns { boolean | object } - either false or a queued call object which wraps the call object
  */
  _getnextcaller( pop = false ) {
    if( 0 === this._callcount ) return false

    for( let i = 0; i < this._fifos.length; i++ ) {
      if( this._fifos[ i ].length > 0 ) {
        let c = this._fifos[ i ][ 0 ]
        let qc = this._calls.get( c )

        if ( pop ) {
          this._callcount--
          this._fifos[ i ].pop()
          this._calls.delete( c )
        }
        return qc
      }
    }

    return false
  }

  /**
  @returns { boolean | object } has it been removed or the queued call.
  @private
  */
  _removefromfifo( call ) {
    if( this._calls.has( call.uuid ) ) {

      let qc = this._calls.get( call.uuid )
      this._calls.delete( call.uuid )

      let fifoindex = this._fifos[ qc.priority - 1 ].indexOf( call.uuid )
      if( -1 !== fifoindex ) {
        this._fifos[ qc.priority - 1 ].splice( fifoindex )
        this._callcount--
      }
      return qc
    }
    return false
  }

  /**
  Remove from our queue
  @param { object } qc - the queued call
  @private
  */
  _onqueuetimeout( qc ) {
    let nextqc = this._getnextcaller()
    if( nextqc.uuid === qc._call.uuid ) {

    }

    this._removefromfifo( qc._call )
  }

  /**
  Called when a caller's call is hung up. Remove from our queues.
  @private
  */
  _hangup( call ) {
    let nextqc = this._getnextcaller()

    /* Reject the queueing call and the agents ringing */
    let qc = this._removefromfifo( call )
    if ( qc ) qc.signalabandoned()
  }

  /**
  Callback function to newuac - confirmed for every bleg created - on creation.
  @param { call } agentcall
  @private
  */
  async _ringallearly( agentcall ) {
    let entity = await agentcall.entity
    if( !entity ) return
    let agent = this._agents[ entity.uri ]
    if( 0 === agent.callcount ) {
      agent.state = "ringing"
    }
    agent.callcount++

    agentcall.on( "call.destroyed", ( call ) => {
      agent.callcount--
    } )
  }

   /**
  Callback function to newuac - when a call connects
  @param { call } agentcall
  @private
  */
  _ringallconfirm( agentcall ) {

    let queuedcall = agentcall.parent
    let qc = this._removefromfifo( queuedcall )
    if( qc ) qc.signalconfirm()
  }

  /**
  Ring all available agents and connect to waiting callers.
  We race for a connection. 
  1. First to answer wins, all other calls are hung up (call manager will do this)
  2. If all agent call fail we retry on uacretrylag
  3. If the current ringing call is abandoned or it has queued timeout we leave this loop and retry on uacretrylag if there are still calls waiting
  4. If an agent becomes available, a new agent call is generated and added to the current next call

  NB: Caller id is presented at start of ringing becuase of point 1 i.e. calls have parents so caller id is passed to child (by the call manager).

  @returns { Promise< boolean > } true if it connects or false (false may also indicate it is retrying)
  @private
  */
  async _ringall() {

    if( 0 === this._callcount ) return

    let nextcall = this._getnextcaller()
    if( !nextcall ) return

    let options = {
      "headers": {
        "Max-Forwards": "0"
      },
      "uactimeout": this._options.uactimeout
    }

    let agents = Object.values( this._agents ).filter( a => "available" === a.state )
    for( let agent of agents ) {
      options.entity = {
        "uri": agent,
        "max": 1
      }

      nextcall._call.newuac( options, {
        "early": this._ringallearly.bind( this ),
        "confirm": this._ringallconfirm.bind( this ) 
      } )
    }
  }

  /**
  We try to be a bit more clever on hunting for an agent.
  1. For all waiting callers we ring an agent (up to the number of agents available), when any connect 
    a. we connect the next available waiting caller
    b. we update the agent's phone caller ID to the connected call
    c. if there are more inbound calls waiting than current ringing agents (and there are more available agents) we re-enter this function
  2. If any waiting call cancels (abandoned) or has queue timed out
    I need to think about this more - one abandoned call needs to allow all of our agent calls to be reassessed
    if they are needed or not.
    a. we remove this call from the queue
    b. if there are more waiting callers than available agents then we re-enter this function to ring another agent
  3. If we uactimeout
    a. we cancel this agent call and we clean up this attempt
    b. we leave this loop and retry on uacretrylag if there are still calls waiting
  4. If an agent becomes available, a new agent call is generated and added to the race

  NB: Becuase of this strategy we can add an auto-answer header to agents to mimick a drop in call to agent system.
  NB: Each agent call will start at a different time - so uactimeout is per agent call in this strategy.
  @returns { Promise< boolean > }
  @private
  */
  async _enterprise() {

    /* finish off how we track our ringing agents */
    if( 0 === this._callcount ) return

    /* add a timeout and a method for us to return from a race on command */
    let timerid

    /* we track these more locally */
    let ourpromises = []
    let ourtimeoutpromiseresolve

    /* Add a timeout */
    ourpromises.push( new Promise( ( r, rj ) => {
      ourtimeoutpromiseresolve = r
      timerid = setTimeout( () => {
        rj( "uactimeout" )
      }, this._options.uactimeout ) } ) )

    let agent = "todoworkoutnextagenttocall"
    ourpromises = ourpromises.concat( await this._callagent( agent ) )

    let dialog = await Promise.race( ourpromises )
        .catch( ( err ) => {
          failure = err
        } )

    /* We have a new agent ready (1) */
    if( dialog ) {

      /* cleanup */
      clearTimeout( timerid )
      ourtimeoutpromiseresolve()

      /* 1.a */
      let call = this._getnextcaller( true )
      if( call ) {
        /* 1.b */
      }

      /* 1.c */
      setTimeout( this._callagents, this._options.uacretrylag )
    }

    /* uactimeout (3) */
    if( "uactimeout" === failure ) {

      /* 3.a */
      for( let dialogpromise of ourpromises ) {
        if( "invitereq" in dialogpromise ) dialogpromise.invitereq.cancel()
      }

      /* 3.b */
      setTimeout( this._callagents, this._options.uacretrylag )
      return false
    }
  }

  /**
  Checks if we have an agent
  @param { string } agent 
  @returns { boolean }
  */
  hasagent( agent ) {
    return ( agent in this._agents )
  }

  /**
  Adds an agent to this queue
  @param { string } agent - agent i.e. "1000@dummy.com"
  @returns { boolean } true if the agent has been added or false otherwise
  */
  addagent( agent, agentinfo ) {
    if( !this.hasagent( agent ) ) {
      this._agents[ agent ] = agentinfo
      
      agentinfo.fifos.add( this )
      return true
    }
    return false
  }

  /**
  Removes an agent from this queue
  @param { string } agent - agent i.e. "1000@dummy.com"
  */
  deleteagent( agent ) {
    if( this.hasagent( agent ) ) {
      this._agents[ agent ].fifos.delete( this )
      delete this._agents[ agent ]
    }
  }

  /**
  Set the mode to either "ringall" or "enterprise"
  */
  set mode( m ) {

    if( 0 !== this._callcount ) return

    switch( m ) {
      case "enterprise":
        this._callagents = this._enterprise.bind( this )
        break
      case "ringall":
      default:
        this._callagents = this._ringall.bind( this )
    }
  }

  /**
  @param { fifo.option } options
  */
  static create( options ) {
    if( !options ) options = {}
    return new fifo( options )
  }
}



module.exports = fifo
