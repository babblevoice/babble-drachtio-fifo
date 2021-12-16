
const fifo = require( "./fifo.js" )

class domain {
  /**
  @param { object } [ options ]
  */
  constructor( options ) {

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
  @returns { Promise< string > } - resolves when answered or failed
  */
  queue( options ) {
    let f = this.getfifo( options.name )
    let waiting = f.queue( options )

    /* Order our next queued calls from each fifo with at least a waiting caller */ 
    let queueswithcalls = []
    for( let fifo of this._fifos ) {
      let nextcallforqueue = fifo._getnextcaller()
      if( nextcallforqueue ) queueswithcalls.push( nextcallforqueue )
    }

    /* oldest first */
    queueswithcalls.sort( ( a, b ) => { return b.age - a.age } )

    /* trigger a calling action in the above order - but don't wait */
    for( let queuedcall of queueswithcalls ) {
      queuedcall._fifo._callagents()
    }

    return waiting
  }

  /**
  Adds a member of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  @param { object } agentinfo - agent info global across all fifos
  */
  addagent( options, agentinfo ) {
    let f = this.getfifo( options.name )
    return f.addagent( options.agent, agentinfo )
  }

  /**
  Removes a member from a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  */
  deleteagent( options ) {
    let f = this.getfifo( options.name )
    return f.deleteagent( options.agent )
  }

  /**
  Returns a fifo object for this domain by name
  */
  getfifo( fifoname ) {
    if( this._fifos.has( fifoname ) ) {
      return this._fifos.get( fifoname )
    }

    let newfifo = fifo.create()
    this._fifos.set( fifoname, newfifo )
    return newfifo
  }

  static create( options ) {
    return new domain( options )
  }
}


module.exports = domain
