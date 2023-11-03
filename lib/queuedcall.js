

/**
Track the lifecycle of a queued call.
@param { object } options - options
@param { object } options.call - the call object from callmanager
@param { number } options.timeout - how long before timeout
@param { number } options.priority - how long before timeout
*/
class queuedcall {
  constructor( fifo, options, ontimeout, onhangup, onpick ) {

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
    this._onhangup = onhangup
    this._onpick = onpick

    this._call.on( "call.destroyed", this._onhangup )
    this._call.on( "call.pick", this._onpick )

    

    /**
    @private
    */
    this._promises = {
      "waiting": new Promise( ( resolve ) => {
        /**
         * @private
         */
        this._resolves = { waiting: resolve }
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
        const ourwaiting = this._resolves.waiting
        delete this._resolves.waiting
        if( this._ontimeout ) this._ontimeout( this )
        this._call.vars.fifo.state = "timeout"
        this._call.vars.fifo.epochs.leave = Math.floor( + new Date() / 1000 )
        if( ourwaiting ) ourwaiting( "timeout" )
      }, this._options.timeout * 1000 )
    }

    this.epochs = {
      "enter": Math.floor( + new Date() / 1000 ),
      "leave": 0
    }

    if( !this._call.vars.fifo ) this._call.vars.fifo = {}

    this._call.vars.fifo.state = "waiting"
    this._call.vars.fifo.priority = this._options.priority
    this._call.vars.fifo.epochs = {}
    this._call.vars.fifo.epochs.enter = this.epochs.enter,
    this._call.vars.fifo.epochs.leave = 0

  }

  /**
  Returns the call object
  @returns { object }
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
    if( !( "waiting" in this._resolves ) ) return
    clearTimeout( this._timers.waiting )

    this._call.vars.fifo.state = "confirm"
    this.epochs.leave = Math.floor( + new Date() / 1000 )
    this._call.vars.fifo.epochs.leave = this.epochs.leave
    this._resolves.waiting( "confirm" )
    
    delete this._timers.waiting
    delete this._resolves.waiting
  }

  /**
  The call has been picked so remove from queue
  */
  signalpicked() {
    if( !( "waiting" in this._resolves ) ) return
    clearTimeout( this._timers.waiting )

    this._call.vars.fifo.state = "picked"
    this._call.vars.fifo.epochs.leave = Math.floor( + new Date() / 1000 )
    this._resolves.waiting( "picked" )
    
    delete this._timers.waiting
    delete this._resolves.waiting
  }

  /**
  The call has been abandoned
  */
  signalabandoned() {
    if( !( "waiting" in this._resolves ) ) return
    clearTimeout( this._timers.waiting )

    this._call.vars.fifo.state = "abandoned"
    this._call.vars.fifo.epochs.leave = Math.floor( + new Date() / 1000 )
    this._resolves.waiting( "abandoned" )
    
    delete this._timers.waiting
    delete this._resolves.waiting
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
    if( !( "waiting" in this._resolves ) ) return
    clearTimeout( this._timers.waiting )
    delete this._resolves.waiting
    delete this._promises.waiting

    this._call.off( "call.destroyed", this._onhangup )
    this._call.off( "call.pick", this._onpick )
  }


  static create( fifo, options, ontimeout, onhangup, onpick ) {
    return new queuedcall( fifo, options, ontimeout, onhangup, onpick )
  }
}


module.exports = queuedcall
