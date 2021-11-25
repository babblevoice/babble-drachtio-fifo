
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
    this._options = options
    if( undefined === this._options.uactimeout ) this._options.uactimeout = 60000
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
    let qc = queuedcall.create( options )

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
      /* Trigger more ringing (if required) */
      this._callagents()
    }
    /* If we get here - we have an agent waiting for us */
  }

  /**
  Return the next queuec call which would be connected.
  @private
  @returns { boolean | object }
  */
  _getnextcaller() {
    if( 0 === this._callcount ) return false

    for( let i = 0; i < this._fifos.length; i++ ) {
      if( this._fifos[ i ].length > 0 ) {
        return this._fifos[ i ][ 0 ]
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
  Called when a call is hung up. Remove from our queues.
  @private
  */
  _hangup( call ) {

    let isnextcaller = false
    let nextuuid = this._getnextcaller()
    if( nextuuid === call.uuid ) isnextcaller = true
    let qc = this._removefromfifo( call )

    /* Reject the queueing call and the agents ringing */
    if( isnextcaller && this._promises.rejects.ringing ) this._promises.rejects.ringing( "abandoned" )
    qc.signalabandoned()
  }

  /**
  Ring all available agents and connect to waiting callers.
  @returns either a dialog, string (error) or false
  */
  async _ringall() {

    if( this._ringingagents.length > 0  ) return

    /* add a timeout and a method for us to return from a race on command */
    let ms = this._options.uactimeout
    let timerid

    this._ringingagents.push( new Promise( ( r, rj ) => {
      this._promises.resolves.ringing = r
      this._promises.rejects.ringing = rj
      timerid = setTimeout( () => {
        this._promises.resolves.ringing = false
        this._promises.rejects.ringing = false
        rj( "timeout" )
      }, ms ) } ) )

    /* ring all of our agents */
    for( let agent of this._agents ) {
      this._ringingagents = this._ringingagents.concat( await this._callagent( agent ) )
    }

    /* If we provide race with zero array then we create a forever pending promise */
    if( 0 === this._ringingagents.length ) return false

    let failure = false
    let dialog = await Promise.race( this._ringingagents )
      .catch( ( err ) => {
        failure = err
      } )

    /* regardless of error or connection cancel all or the rest */
    for( let dialogpromise of this._ringingagents ) {
      if( failure || !dialog || dialog.callId !== dialogpromise.invitereq.get( "call-id" ) ) {
        if( "invitereq" in dialogpromise ) dialogpromise.invitereq.cancel()
      }
    }

    this._ringingagents = []

    if( this._promises.resolves.ringing ) {
      this._promises.resolves.ringing()
      this._promises.resolves.ringing = false
      this._promises.rejects.ringing = false
      clearTimeout( timerid )
    }

    if( failure ) return failure
    if( dialog ) return dialog
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
  @return { Array< Promise< dialog > > }
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

  static create( options ) {
    if( !options ) options = {}
    return new fifo( options )
  }
}



module.exports = fifo
