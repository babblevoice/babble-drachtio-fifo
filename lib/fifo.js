
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
    this._agents = []
    this._ringingagents = []

    /**
    @private
    */
    this._promises = {
      "rejects": {
        "ringing": false
      },
      "resolves": {
        "ringing": false
      }
    }

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
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue
  @param { number } [ options.priority = 5 ] - the priority - 1-10
  @returns { Promise } - resolves when we have been answered or failed
  @throws { string } reason - "timeout"
  */
  async queue( options ) {

    /* sanity */
    if( !Number.isInteger( options.priority ) ||
        options.priority < 1 ||
        options.priority >= this._fifos.length ) {
      options.priority = 5
    }

    /* register for a hungup */
    options.call.on( "call.hangup", this._hangup.bind( this ) )

    /* Wrap our call with extra info */
    let qc = queuedcall.create( options, this._onqueuetimeout.bind( this ) )

    options.call.vars.fifo = { 
      "state": "waiting",
      "epochs": {
        "enter": Math.floor( + new Date() / 1000 ),
        "leave": 0
      }
    }

    this._callcount++
    this._fifos[ options.priority - 1 ].push( options.call.uuid )
    this._calls.set( options.call.uuid, qc )

    /* trigger our routine to call agents - but don't wait */
    this._callagents()

    /*
    We will resolve when we have an agent we are able to bridge to.
    If we are abandoned or timeout then an expcetion is thrown
    so we return from this function.
    */

    try {
      await qc.waitforwaiting()
    } finally {
      this._removefromfifo( options.call )

      /* Trigger more ringing (if required) */
      if( this._callcount > 0 ) this._callagents()
    }
    /* If we get here - we have an agent waiting for us */
  }

  /**
  Return the next queued call which would be connected.
  @param { boolean } [ pop = false ] whether to remove the call from our queue
  @private
  @returns { boolean | object }
  */
  _getnextcaller( pop = false ) {
    if( 0 === this._callcount ) return false

    for( let i = 0; i < this._fifos.length; i++ ) {
      if( this._fifos[ i ].length > 0 ) {
        let c = this._fifos[ i ][ 0 ]
        if ( pop ) {
          this._callcount--
          this._fifos[ i ].pop()
        }
        return c
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
    let isnextcaller = false
    let nextuuid = this._getnextcaller()
    if( nextuuid === qc._call.uuid ) isnextcaller = true
    this._removefromfifo( qc._call )
    qc._call.vars.fifo.state = "timeout"

    if( isnextcaller && this._promises.rejects.ringing ) this._promises.rejects.ringing( "timeout" )
  }

  /**
  Called when a call is hung up. Remove from our queues.
  @private
  */
  _hangup( call ) {

    let isnextcaller = false
    let nextuuid = this._getnextcaller()
    if( nextuuid === call.uuid ) isnextcaller = true
    let qc = this._removefromfifo( call )

    /* Reject the queueing call and the agents ringing */
    call.vars.fifo.state = "abandoned"
    if( isnextcaller && this._promises.rejects.ringing ) this._promises.rejects.ringing( "abandoned" )
    if ( qc ) qc.signalabandoned()
  }

  /**
  Ring all available agents and connect to waiting callers.
  We race for a connection. 
  1. First to answer wins
    a. all other calls are hung up 
    b. timer is canceled and promise cleaned up
    c. if there are more inbound calls waiting we immediatly re-enter this function
    d. we connect to a caller and we leave the loop 
  2. If any call cancels
    a. we remove and continue with remaining agents
    b. if there are no further agents clean up and leave this function and retry on uacretrylag
  3. If we uactimeout or the current ringing call is abandoned or the call has queued timeout
    a. we cancel all agent calls
    b. we leave this loop and retry on uacretrylag if there are still calls waiting
  4. If an agent becomes available, a new agent call is generated and added to the race

  NB: I don't remove a createUAC request until all have failed (or one has won).
  I think it is safe to cancel requests which have already canceled (or errored in general).
  @returns { Promise< boolean > } true if it connects or false (false may also indicate it is retrying)
  */
  async _ringall() {

    if( this._ringingagents.length > 0  ) return
    if( 0 === this._callcount ) return

    /* add a timeout and a method for us to return from a race on command */
    let timerid

    /* We always have a timeout which means our race never jams */
    this._ringingagents.push( new Promise( ( r, rj ) => {
      this._promises.resolves.ringing = r
      this._promises.rejects.ringing = rj
      timerid = setTimeout( () => {
        this._promises.resolves.ringing = false
        this._promises.rejects.ringing = false
        rj( "uactimeout" )
      }, this._options.uactimeout ) } ) )

    /* ring all of our agents */
    for( let agent of this._agents ) {
      this._ringingagents = this._ringingagents.concat( await this._callagent( agent ) )
    }

    let clientfailcount = 0
    do {
      let failure = false

      let dialog = await Promise.race( this._ringingagents )
        .catch( ( err ) => {
          failure = err
        } )

      if( dialog ) {
        /* We have a winner (1) */
        /* 1.a */
        for( let dialogpromise of this._ringingagents ) {
          if( dialog.callId !== dialogpromise.invitereq.get( "call-id" ) ) {
            if( "invitereq" in dialogpromise ) dialogpromise.invitereq.cancel()
          }
        }

        /* 1.b */
        clearTimeout( timerid )
        this._promises.resolves.ringing()
        this._promises.resolves.ringing = false
        this._promises.rejects.ringing = false
        this._ringingagents = []

        /* 1.c */
        let call = this._getnextcaller( true )
        setTimeout( this._callagents, this._options.uacretrylag )

        /* This shouldn't happen */
        if( !call ) return

        /* 1.d */
        /* TODO - connect the call */
        call.vars.fifo.state = "connected"
        
        return true
      }

      /* An agent call has canceled (or some other error) (2) */
      if( null !== failure && "object" === typeof failure && "status" in failure ) {
        clientfailcount++
        if( ( this._ringingagents.length - clientfailcount -1 ) > 0 ) {
          /* 2.a - we have more agents ringing */
          continue
        } else {
          /* 2.b - we have no more agents */
          clearTimeout( timerid )
          this._promises.resolves.ringing()
          this._promises.resolves.ringing = false
          this._promises.rejects.ringing = false

          setTimeout( this._callagents, this._options.uacretrylag )

          return false
        }
      }

      /* We have timeouted or call abandoned (3) */
      switch( failure ) {
        case "uactimeout":
        case "abandoned":
        case "timeout": {
          /* 3.a */
          for( let dialogpromise of this._ringingagents ) {
            if( "invitereq" in dialogpromise ) dialogpromise.invitereq.cancel()
          }

          this._ringingagents = []

          if( "uactimeout" !== failure ) clearTimeout( timerid )

          /* 3.b */
          setTimeout( this._callagents, this._options.uacretrylag )
          return false
        }
      }

      /* We have another Promise.race (4) */

    } while( true )

    return false
  }

  /**
  */
  async _enterprise() {

  }

  /**
  Phones are called using the relavent strategy. Once they have been answered,
  we pass them to our queue to have a queuing call assigned to it so that
  late sdp can be sent (we don't know which rtp server the call is on).
  The 2 calls can be logically joined and audio bridged.
  @param { string } agent - the agent in the form user@realm
  @return { Promise< Array< Promise< dialog > > > }
  @private
  */
  async _callagent( agent ) {

    if( !this._options.registrar ) return []
    let contacts = await this._options.registrar.contacts( agent )

    let uacoptions = {
      noAck: true
    }

    let dialogs = []

    contacts.contacts.forEach( ( contact ) => {

      let invitereq
      let dialog = this._options.srf.createUac( contact, uacoptions, {
          cbRequest: ( err, req ) => {
            /* use this to cancel i.e. dialog.invitereq.cancel() */
            invitereq = req
          },
          cbProvisional: ( res ) => {
            /* Phone ringing */
          }
        } ).catch( ( err ) => {

        } )

        dialog.invitereq = invitereq
        dialogs.push( dialog )
    } )

    return dialogs
  }

  _connecttoagent() {

  }

  /**
  Sets the agents of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { Array< string > } options.agents - array of agents i.e. [ "1000@dummy.com" ]
  */
  agents( options ) {
    this._agents = options.agents
  }

  /**
  Sets the agents of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  */
  agent( options ) {
    this._agents.push( options.agent )
  }

  /**
  Set the mode to either "ringall" or "enterprise"
  */
  set mode( m ) {
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
