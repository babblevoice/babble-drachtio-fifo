
const fifo = require( "./fifo.js" )
const queuedcall = require("./queuedcall.js")

class domain {
  /**
  @param { object } [ options ]
  */
  constructor( options ) {

    this._options = options

    /**
    Each domain has multiple fifos indexed by name
    @private
    */
    this._fifos = new Map()

  }

  /**
  Queue a call with options
  @param { object } options
  @param { object } options.call
  @param { string } options.name - the name of the queue
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue
  @param { number } [ options.priority = 5 ] - the priority - 1-10
  @param { string } [ options.mode = "ringall" ] - or "enterprise"
  @returns { Promise< string > } - resolves when answered or failed
  */
  async queue( options ) {
    const f = this.getfifo( options.name )
    return await f.queue( options )
  }

  /**
   * Called from f.queue() (in the queue function of this object)
   */
  _onqueueing() {

    /* Order our next queued calls from each fifo with at least a waiting caller */ 
    const queueswithcalls = []
    for( const [ ,fifo ] of this._fifos ) {
      const nextcallforqueue = fifo._getnextcaller()
      if( nextcallforqueue ) queueswithcalls.push( nextcallforqueue )
    }

    /* oldest first */
    queueswithcalls.sort( ( a, b ) => { return b.age - a.age } )

    /* trigger a calling action in the above order - but don't wait */
    for( const queuedcall of queueswithcalls ) {
      queuedcall._fifo._callagents()
    }

  }

  /**
  Get the oldest call from domain's fifos
  @return { object | undefined } call
  */
  getoldestcall() {
    /* Order our next queued calls from each fifo with at least a waiting caller */ 
    const queueswithcalls = []
    for( const [ ,fifo ] of this._fifos ) {
      const nextcallforqueue = fifo._getnextcaller()
      if( nextcallforqueue ) queueswithcalls.push( nextcallforqueue )
    }

    /* oldest first */
    queueswithcalls.sort( ( a, b ) => { return b.age - a.age } )

    return queueswithcalls[ 0 ]
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
    const f = this.getfifo( options.name )
    if( f.addagent( options.agent, agentinfo ) ) {
      f._callagents()
      return true
    }
    
    return false
  }

  /**
  Removes a member from a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  */
  deleteagent( options ) {
    const f = this.getfifo( options.name )
    return f.deleteagent( options.agent )
  }

  /**
  Returns a fifo object for this domain by name
  */
  getfifo( fifoname ) {
    if( this._fifos.has( fifoname ) ) {
      return this._fifos.get( fifoname )
    }

    const newfifo = fifo.create( fifoname, this._options, this )
    this._fifos.set( fifoname, newfifo )
    return newfifo
  }

  getfifos() {
    return [ ...this._fifos.keys() ]
  }

  static create( options ) {
    return new domain( options )
  }
}


module.exports = domain
