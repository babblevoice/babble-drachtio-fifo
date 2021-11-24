
const domain = require( "./lib/domain.js" )

/**
Manage all of our fifos (queues), calls queueing and agents.
*/
class fifos {

  /**
  @param { object } options
  @param { object } options.em - event emmitter
  @param { object } srf.srf - srf object
  */
  constructor( options ) {

    /**
    @private
    */
    this._options = options

    /**
    @private
    */
    this._domains = new Map()
  }

  /**
  Queue a call with options
  @param { object } options
  @param { call } options.call
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue
  @param { number } [ options.priority = 5 ] - the priority - 1-10 - the lower the higher the priority
  @param { string } [ options.mode = "ringall" ] - or "enterprise"
  @returns { Promise } - resolves when answered or fails.
  */
  async queue( options ) {
    let d = this._getdomain( options.domain )
    if( d ) await d.queue( options )
  }

  /**
  Sets the members of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { array.< string > } options.agents - array of agents i.e. [ "1000@dummy.com" ]
  */
  agents( options ) {
    let d = this._getdomain( options.domain )
    if( d ) d.agents( options )
  }

  /**
  Create or return a domain object containing a domains fifos.
  @private
  @param { string } domainname
  @return { domain }
  */
  _getdomain( domainname ) {

    if( this._domains.has( domainname ) ) {
      return this._domains.get( domainname )
    }

    let newdomain = domain.create()
    this._domains.set( domainname, newdomain )
    return newdomain
  }

  /**
  Shortcut to create fifos.
  */
  static create( options ) {
    return new fifos( options )
  }
}


module.exports = fifos
