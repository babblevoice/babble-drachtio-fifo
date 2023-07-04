
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
*/
const defaultoptions = {
  "uactimeout": 60000
}

/**
A fifo (first in first out) maintains multiple queues (also fifos)
for different strategies and priorities.
*/
class fifo {
  constructor( name, options ) {

    this._name = name

    /**
    10 different priorities
    @private
    */
    this._fifos = []
    for( let i = 0; 10 > i ; i++ ) this._fifos.push( [] )

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
    All of our agents i.e. { "1000@dummy.com": { agentinfo } }
    @private
    */
    this._agents = {}

    /**
    _ringall or _enterprise
    @private
    */
    this._callagents = this._ringall.bind( this )

    /**
     * maintain description of mode
     * @private
     */
    this._mode = "ringall"

    /**
    Store our options and set required defaults
    @private
    */
    this._options = { ...defaultoptions, ...options }

    this._enterpriseoutboundcalls = new Set()
  }

  /**
  Queue a call with options
  @param { object } options
  @param { call } options.call - required
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue (S)
  @param { number } [ options.priority = 5 ] - the priority - 1-10
  @param { string } [ options.mode = "ringall" ] - or "enterprise"
  @param { object } [ options.callerid ]
  @param { string } [ options.callerid.number ] - overide caller id on bleg
  @param { string } [ options.callerid.name ] - overide caller id name on bleg
  @returns { Promise< string > } - with a string with the last state (confirm|abandoned|timeout|picked)
  */
  queue( options ) {

    if( !options.call ) return
    if( !options.call.vars ) options.call.vars = {}
    if( !options.call.vars.fifo ) options.call.vars.fifo = {}

    /* sanity */
    if( !Number.isInteger( options.priority ) ||
        1 > options.priority ||
        options.priority >= this._fifos.length ) {
      options.priority = 5
    }

    options.call.vars.fifo.mode = "ringall"
    if( options.mode ) {
      options.call.vars.fifo.mode = options.mode
      this.mode = options.mode
    }

    if( options.callerid ) {
      this._options.callerid = options.callerid
    }
    
    /* Wrap our call with extra info */
    const qc = queuedcall.create( this, 
      options, 
      this._onqueuetimeout.bind( this ),
      this._hangup.bind( this ),
      this._pick.bind( this ) )

    this._callcount++
    this._fifos[ options.priority - 1 ].push( options.call.uuid )
    this._calls.set( options.call.uuid, qc )


    options.call.vars.fifo.position = this._fifos[ options.priority - 1 ].length - 1
    options.call.vars.fifo.name = this._name

    options.call.vars.fifo.counts = {
      "waiting": this._callcount,
      "talking": 0,
      "agent": Object.keys( this._agents ).length
    }

    options.call.emit( "fifo.enter", options.call )

    /*
    We will resolve when we have an agent we are able to bridge to.
    If we are abandoned or timeout then an expcetion is thrown
    so we return from this function.
    */
    return qc.wait()
  }

  /**
  Emits a fifo.update on all other calls whos position may have changed as
  qc will no longer be in the queue
  @param { queuedcall } qc
  */
  _fifoupdate( qc ) {

    for( let i = qc.call.vars.fifo.position; 
      i < this._fifos[ qc.priority - 1 ].length;
      i++ ) {

      const otherqcuuid = this._fifos[ qc.priority - 1 ][ i ]
      const otherqc = this._calls.get( otherqcuuid )
      if( otherqc ) {
        otherqc.call.vars.fifo.position = i
        otherqc.call.emit( "fifo.update", otherqc.call )
      }
    }
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
      if( 0 < this._fifos[ i ].length ) {
        const c = this._fifos[ i ][ 0 ]
        const qc = this._calls.get( c )

        if ( pop ) {
          this._callcount--
          this._fifos[ i ].shift()
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

      const qc = this._calls.get( call.uuid )
      this._calls.delete( call.uuid )

      const fifoindex = this._fifos[ qc.priority - 1 ].indexOf( call.uuid )
      if( -1 !== fifoindex ) {
        this._fifos[ qc.priority - 1 ].splice( fifoindex, 1 )
        this._callcount--
        /* double check */
        if( 0 > this._callcount ) this._callcount = 0
      }

      call.emit( "fifo.leave", call )
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
    const nextqc = this._getnextcaller()
    if( !nextqc ) {
      console.error( "Queue item has timed out but get next caller returned falsey" )
      return
    }

    if( nextqc.uuid === qc.uuid && 0 === this._callcount ) {
      for( const entcall of this._enterpriseoutboundcalls ) {
        entcall.hangup( entcall.hangupcodes.REQUEST_TIMEOUT )
      }
      this._enterpriseoutboundcalls.clear()
    }

    this._removefromfifo( qc.call )
    qc.destroy()
    this._fifoupdate( qc )
  }

  /**
  Called when a call is picked by another call - so we stop processing
  @param { call } call 
  @private
  */
  _pick( call ) {
    /* Reject the queueing call and the agents ringing */
    const qc = this._removefromfifo( call )
    if ( !qc ) return

    qc.signalpicked()
    this._fifoupdate( qc )

    qc.destroy()
  }

  /**
  Called when a caller's call is hung up. Remove from our queues.
  @param { call } call 
  @private
  */
  _hangup( call ) {
    /* Reject the queueing call and the agents ringing */
    const qc = this._removefromfifo( call )
    if ( !qc ) return

    qc.signalabandoned()
    this._fifoupdate( qc )

    qc.destroy()
  }

  /**
  Callback function to newuac - confirmed for every bleg created - on creation.
  @param { call } agentcall
  @private
  */
  async _ringallearly( agentcall ) {
    const entity = await agentcall.entity
    if( !entity ) return
    const agent = this._agents[ entity.uri ]
    if( 0 === agent.callcount ) {
      agent.state = "ringing"
    }
    agent.callcount++

    agentcall.on( "call.destroyed", ( /*call*/ ) => {
      agent.callcount--
      if( 0 > agent.callcount ) agent.callcount = 0
    } )
  }

  /**
   * Callback function to newuac - when a call connects
   * @param { call } agentcall
   * @private
   */
  _ringallconfirm( agentcall ) {
    const qc = this._removefromfifo( agentcall.parent )
    if( !qc ) return

    qc.signalconfirm()
    this._fifoupdate( qc )

    qc.destroy()
  }

  /**
  Ring all available agents and connect to waiting callers.
  We race for a connection. 
  1. First to answer wins, all other calls are hung up (call manager will do this)
  2. As calls fail this function is called again to retry
  3. If the current ringing call is abandoned the call is removed from the queue
  4. If an agent becomes available, this function is called again by our framework

  NB: Caller id is presented at start of ringing becuase of point 1 i.e. calls have parents so caller id is passed to child (by the call manager).

  @returns { Promise< boolean > } true if it connects or false (false may also indicate it is retrying)
  @private
  */
  async _ringall() {

    if( 0 === this._callcount ) return

    const nextcall = this._getnextcaller()
    if( !nextcall ) return

    const agents = Object.values( this._agents ).filter( a => "available" === a.state )
    if( Array.isArray( agents ) ) {
      agents.forEach( ( agent ) => {

        agent.last = + new Date()

        const options = {
          "headers": {
            "Max-Forwards": "0"
          },
          "uactimeout": this._options.uactimeout,
          "entity": {
            "uri": agent.uri,
            "max": 1
          }
        }

        if( this._options.callerid ) {
          options.callerid = this._options.callerid
        }
  
        nextcall._call.newuac( options, {
          "early": this._ringallearly.bind( this ),
          "confirm": this._ringallconfirm.bind( this ) 
        } )
      } )
    }
  }

  /**
  Callback function to newuac - called for every call triggered.
  @param { call } agentcall
  @private
  */
  async _enterpriseallearly( agentcall ) {
    this._enterpriseoutboundcalls.add( agentcall )

    const entity = await agentcall.entity
    if( !entity ) return
    const agent = this._agents[ entity.uri ]
    if( 0 === agent.callcount ) {
      agent.state = "ringing"
    }
    agent.callcount++

    agentcall.on( "call.destroyed", ( /*call*/ ) => {
      this._enterpriseoutboundcalls.delete( agentcall )
      agent.callcount--
      if( 0 > agent.callcount ) agent.callcount = 0
    } )
  }

  /**
  Callback function to newuac - when a call connects
  @param { call } agentcall
  @private
  */
  _enterpriseallconfirm( agentcall ) {

    if( 0 === this._callcount ) {
      for( const agentcall of this._enterpriseoutboundcalls ) {
        agentcall.hangup( agentcall.hangupcodes.LOSE_RACE )
      }
      this._enterpriseoutboundcalls.clear()
    }

    const queuedcall = this._getnextcaller( true )
    if( !queuedcall ) return

    queuedcall.call.adopt( agentcall )
    agentcall.update()

    queuedcall.signalconfirm()
    this._fifoupdate( queuedcall )

    queuedcall.destroy()
  }

  /**
  We try to be a bit more clever on hunting for an agent.
  1. Next to answer gets next in queue, remaining agent calls are only hung up if there are no more callers available
  2. If 1 caller in the queue, 1 outbound agent call, if 2 callers in the queue 2 outbound agent calls up to the number of agents
  3. As calls fail this function is called again to retry
  4. If the current ringing call is abandoned the call is removed from the queue

  NB: Becuase of this strategy we can add an auto-answer header to agents to mimick a drop in call to agent system.
  NB: Each agent call will start at a different time - so uactimeout is per agent call in this strategy.
  @returns { Promise< boolean > }
  @private
  */
  async _enterprise() {

    /* finish off how we track our ringing agents */
    if( 0 === this._callcount ) return
    if( this._enterpriseoutboundcalls.size >= this._callcount ) return /* 2. */

    const nextcall = this._getnextcaller()
    if( !nextcall ) return

    /* get next agent - the oldest by age of when we last called them */
    const agents = Object.values( this._agents ).sort( ( a, b ) => { return a.last - b.last } )

    if( 0 === agents.length ) return
    const agent = agents[ 0 ]
    agent.last = + new Date

    const options = {
      "headers": {
        "Max-Forwards": "0"
      },
      "uactimeout": this._options.uactimeout,
      "entity": {
        "uri": agent.uri,
        "max": 1
      },
      "orphan": true
    }

    if( this._options.callerid ) {
      options.callerid = this._options.callerid
    }

    nextcall.call.newuac( options, {
      "early": this._enterpriseallearly.bind( this ),
      "confirm": this._enterpriseallconfirm.bind( this )
    } )
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

  get agents() {
    return Object.keys( this._agents )
  }

  get size() {
    return this._callcount
  }

  /**
  Set the mode to either "ringall" or "enterprise"
  */
  set mode( m ) {

    if( 0 !== this._callcount ) return

    switch( m ) {
    case "enterprise":
      this._callagents = this._enterprise.bind( this )
      this._mode = "enterprise"
      break
    case "ringall":
    default:
      this._callagents = this._ringall.bind( this )
      this._mode = "ringall"
    }
  }

  /**
  @param { fifo.option } options
  */
  static create( name, options ) {
    if( !options ) options = {}
    return new fifo( name, options )
  }

  /**
   * @return { object } object with info regarding current state of this fifo
   */
  info() {

    const agents = []

    for( const [ , agent ] of Object.entries( this._agents ) ) {
      agents.push( {
        uri: agent.uri,
        state: agent.state,
        callcount: agent.callcount,
        last: agent.last,
        agentlag: agent.agentlag,
        fifocount: agent.fifos.size
      } )
    }

    return {
      size: this._callcount,
      mode: this._mode,
      agents,
      queue: {
        calls: this._calls.keys()
      },
      uactimeout: this._options.uactimeout
    }
  }
}



module.exports = fifo
