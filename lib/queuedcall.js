

/**
Track the lifecycle of a queued call.
@param { object } options - options
@param { call } options.call - the call object from callmanager
@param { number } options.timeout - how long before timeout
@param { number } options.priority - how long before timeout
*/
class queuedcall {
  constructor( fifo, options, ontimeout ) {

    /**
    @private
    */
    this._fifo = fifo

    /**
    @private
    */
    this._call = options.call

    /**
    @private
    */
   this._ontimeout = ontimeout

    /**
    @private
    */
    this._resolves = {
      "waiting": false
    }

    /**
    @private
    */
    this._promises = {
      "waiting": new Promise( ( resolve ) => {
        this._resolves.waiting = resolve
      } )
    }

    /**
    @private
    */
    this._options = options
    if( undefined === this._options.timeout ) this._options.timeout = 3600 /* S */

    /**
    @private
    */
    this._timers = {
      "waiting": setTimeout( () => { 
        if( this._ontimeout ) this._ontimeout( this )
        this._call.vars.fifo.state = "timeout"
        this._call.vars.fifo.epochs.leave = Math.floor( + new Date() / 1000 )
        if( this._resolves.waiting ) this._resolves.waiting( "timeout" ) 
        this._resolves.waiting = false
      }, this._options.timeout * 1000 )
    }

    this.epochs = {
      "enter": Math.floor( + new Date() / 1000 ),
      "leave": 0
    }

    this._call.vars.fifo = {
      "state": "waiting",
      "epochs": {
        "enter": this.epochs.enter,
        "leave": 0
      }
    }
  }

  /**
  Returns the call object
  @returns { call }
  */
  get call() {
    return this._call
  }

  /**
  Return the number of seconds that this caller has been waiting
  @returns { number }
  */
  get age() {
    return Math.floor( + new Date() / 1000 ) - this.epochs.enter
  }

  /**
  Returns the uuid of the call
  @returns { string }
  */
  get uuid() {
    return this._call.uuid
  }

  /**
  Returns the priority of the queued call
  @returns { number }
  */
  get priority() {
    return this._options.priority
  }

  /**
  Returns the promise which resolves when the call is no longer queueing
  @returns { Promise }
  */
  wait() {
    return this._promises.waiting
  }

  /**
  The call has been answered
  */
  signalconfirm() {
    if( this._timers.waiting ) clearTimeout( this._timers.waiting )
    this._timers.waiting = false

    this._call.vars.fifo.state = "confirm"
    this.epochs.leave = Math.floor( + new Date() / 1000 )
    this._call.vars.fifo.epochs.leave = this.epochs.leave
    this._resolves.waiting( "confirm" )
    this._resolves.waiting = false
  }

  /**
  The call has been abadnoned
  */
  signalabandoned() {
    if( this._timers.waiting ) clearTimeout( this._timers.waiting )
    this._timers.waiting = false

    this._call.vars.fifo.state = "abandoned"
    this._call.vars.fifo.epochs.leave = Math.floor( + new Date() / 1000 )
    this._resolves.waiting( "abandoned" )
    this._resolves.waiting = false
  }

  /**
  @returns { boolean }
  */
  get hungup() {
    return !!this._call.hangup_cause
  }

  /**
  Cleanup this object
  */
  destroy() {
    if( !this._resolves.waiting ) this._resolves.waiting()
    this._resolves.waiting = false
    this._promises.waiting = false
  }


  static create( fifo, options, ontimeout = false ) {
    return new queuedcall( fifo, options, ontimeout )
  }
}


module.exports = queuedcall
