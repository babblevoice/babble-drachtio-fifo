
const fifo = require( "./fifo.js" )

class domain {
  constructor() {

    /**
    Each domain has multiple fifos indexed by name
    @private
    */
    this._fifos = new Map()

  }

  /**
  Queue a call with options
  @param { object } options
  @param { call } options.call
  @param { string } options.name - the name of the queue
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue
  @param { number } [ options.priority = 5 ] - the priority - 1-10
  @param { string } [ options.mode = "ringall" ] - or "enterprise"
  @returns { Promise } - resolves when answered or failed
  */
  async queue( options ) {
    let f = this._getfifo( options.name )
    if( f ) await f.queue( options )
  }

  /**
  Sets the members of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { array.< string > } options.agents - array of agents i.e. [ "1000@dummy.com" ]
  */
  agents( options ) {
    let f = this._getfifo( options.name )
    if( f ) f.agents( options )
  }

  /**
  @private
  */
  _getfifo( fifoname ) {
    if( this._fifos.has( fifoname ) ) {
      return thisthis._fifos.get( fifoname )
    }

    let newfifo = fifo.create()
    thisthis._fifos.set( fifoname, newfifo )
    return newfifo
  }

  static create() {
    return new domain()
  }
}


module.exports = domain
