

/**
Track the lifecycle of a queued call.
@param { object } options - options
@param { call } options.call - the call object from callmanager
@param { number } options.timeout - how long before timeout
@param { number } options.priority - how long before timeout
*/
class queuedcall {
  constructor( options, ontimeout ) {

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
    this._rejects = {
      "waiting": false
    }

    /**
    @private
    */
    this._promises = {
      "waiting": new Promise( ( resolve, reject ) => {
        this._resolves.waiting = resolve
        this._rejects.waiting = reject
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
        if( this._rejects.waiting ) this._rejects.waiting( "timeout" ) 
      }, this._options.timeout * 1000 )
    }
  }

  get uuid() {
    return this._call.uuid
  }

  get priority() {
    return this._options.priority
  }

  async waitforwaiting() {
    await this._promises.waiting
  }

  signalwaiting() {
    if( this._timers.waiting ) clearTimeout( this._timers.waiting )
    this._timers.waiting = false

    r = this._resolves.waiting
    this._resolves.waiting = false
    this._rejects.waiting = false
    this._promises.waiting = false

    r()
  }

  signalabandoned() {

    if( this._timers.waiting ) clearTimeout( this._timers.waiting )
    this._timers.waiting = false

    let r = this._rejects.waiting
    this._resolves.waiting = false
    this._rejects.waiting = false
    this._promises.waiting = false

    r( "abandoned" )
  }

  /**
  @returns { boolean }
  */
  get hungup() {
    return !!this._call.hangup_cause
  }

  destroy() {
    if( !this._resolves.waiting ) this._resolves.waiting()
    this._resolves.waiting = false
    this._promises.waiting = false
  }


  static create( options, ontimeout = false ) {
    return new queuedcall( options, ontimeout )
  }
}


module.exports = queuedcall
