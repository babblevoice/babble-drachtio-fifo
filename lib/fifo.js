
const events = require( "events" )
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
  constructor( name, options, domain ) {

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
    So we don't have to sum calls in fifos
    @private
    */
    this._talking = 0

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

    /**
     * @private
     */
    this._domain = domain
  }

    /**
  @param { object } options
  */
  static create( name, options, domain ) {
    if( !options ) options = {}

    if( !options.em ) {
      options.em = new events.EventEmitter()
    }

    return new fifo( name, options, domain )
  }

  /**
  Queue a call with options
  @param { object } options
  @param { object } options.call - required
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue (S)
  @param { number } [ options.priority = 5 ] - the priority - 1-10
  @param { "ringall"|"enterprise" } [ options.mode = "ringall" ] - or "enterprise"
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
        options.priority > this._fifos.length ) {
      options.priority = 5
    }

    options.call.vars.fifo.mode = "ringall"
    if( options.mode ) {
      options.call.vars.fifo.mode = options.mode
      this.mode = options.mode
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
      "talking": this._talking,
      "agent": Object.keys( this._agents ).length
    }

    options.call.emit( "fifo.enter", options.call )
    this._options.em.emit( "fifo.enter", options.call )

    /* now we trigger a dial - but from a domain perspective */
    this._domain._onqueueing()
    /*
    We will resolve when we have an agent we are able to bridge to.
    If we are abandoned or timeout then an expcetion is thrown
    so we return from this function.
    */
    return qc.wait()
  }

  /**
  Get a queuedcall by uuid
  */
  getcallbyuuid( uuid ) {
    return this._calls.get( uuid )
  }

  /**
   * Get a call by callerid
   * @param { object } callerid
   * @param { string } callerid.user
   * @return { object }
   */
  getcallbycallerid( callerid ) {
    for ( let priority = 0; priority < this._fifos.length; priority++ ) {
      for ( let index = 0; index < this._fifos.length; index++ ) {
        const othercall = this._calls.get( this._fifos[ priority ][ index ] )
        if ( othercall
             && othercall.call.callerid.user == callerid.user ) {
          return othercall.call
        }
      }
    }
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

        otherqc.call.vars.fifo.counts = {
          "waiting": this._callcount,
          "talking": this._talking,
          "agent": Object.keys( this._agents ).length
        }

        try {
          otherqc.call.emit( "fifo.update", otherqc.call )
          this._options.em.emit( "fifo.update", otherqc.call )
        } catch( e ) {
          console.error( e )
        }
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
   * 
   * @param { object } call 
   */
  #emitfifohangup( call ) {
    if( !call || !call.vars || !call.vars.fifo ) {
      console.trace( "We should not get here - please check it out if you ever see it" )
      return
    }

    call.vars.fifo.counts = {
      "waiting": this._callcount,
      "talking": this._talking,
      "agent": Object.keys( this._agents ).length
    }

    call.emit( "fifo.hangup", call )
    this._options.em.emit( "fifo.hangup", call )
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

      call.vars.fifo.counts = {
        "waiting": this._callcount,
        "talking": this._talking,
        "agent": Object.keys( this._agents ).length
      }

      call.emit( "fifo.leave", call )
      this._options.em.emit( "fifo.leave", call )
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
    this._removefromfifo( qc.call )
    qc.destroy()
    this._fifoupdate( qc )

    this.#clearenterpriseagentcalls( qc.call.hangupcodes.SERVER_TIMEOUT )
  }

  /**
  Called when a call is picked by another call - so we stop processing
  @param { object } call 
  @private
  */
  _pick( call ) {

    this._talking++
    /* see notes in _enterpriseallconfirm */
    const cleanupcall = () => {
      this._talking--
      this.#emitfifohangup( call )
    }
    if( call.destroyed ) cleanupcall()
    else call.on( "call.destroyed", cleanupcall )

    /* Reject the queueing call and the agents ringing */
    const qc = this._removefromfifo( call )
    if ( !qc ) return

    qc.signalpicked()
    this._fifoupdate( qc )

    qc.destroy()

    if( "ringall" == this._mode ) {
      for( const agentcall of call.children ) {
        if( agentcall.established ) continue
        agentcall.detach()
        agentcall.hangup( call.hangupcodes.PICKED_OFF )
      }
    } else {
      this.#clearenterpriseagentcalls( call.hangupcodes.PICKED_OFF )
    }
  }

  /**
  Called when a caller's call is hung up. Remove from our queues.
  @param { object } call 
  @private
  */
  _hangup( call ) {

    if( call.vars.fifo.noremoveonhangup ) return

    /* Reject the queuing call and the agents ringing */
    const qc = this._removefromfifo( call )
    if ( !qc ) return

    qc.signalabandoned()
    this._fifoupdate( qc )

    qc.destroy()

    this.#clearenterpriseagentcalls( call.hangupcodes.USER_GONE )
  }

  /**
   * Final check - if we have no more calls then cancel all calls to agents
   */
  #clearenterpriseagentcalls( reason ) {
    if( 1 > ( this._callcount - this._talking ) ) {
      for( const agentcall of this._enterpriseoutboundcalls ) {
        if( agentcall.established ) continue
        agentcall.hangup( reason )
      }
    }
  }

  /**
  Callback function to newuac - confirmed for every bleg created - on creation.
  @param { object } agentcall
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
   * @param { object } agentcall
   * @private
   */
  _ringallconfirm( agentcall ) {

    this._talking++

    /* see notes in _enterpriseallconfirm */
    const call = agentcall.parent
    const cleanupcall = () => {
      this._talking--
      this.#emitfifohangup( call )
    }
    agentcall.on( "call.destroyed", cleanupcall )

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

        if( nextcall._options.callerid ) {
          options.callerid = nextcall._options.callerid
        }

        nextcall.call.newuac( options, {
          "early": this._ringallearly.bind( this ),
          "confirm": this._ringallconfirm.bind( this ) 
        } )
      } )
    }
  }

  /**
  Callback function to newuac - called for every call triggered.
  @param { object } agentcall
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
  @param { object } agentcall
  @param { object } queuedcall - handled in cm as cookie - we pass it in to be passed back
  @private
  */
  _enterpriseallconfirm( agentcall, queuedcall ) {

    if( !queuedcall ) return

    const request = { queuedcall: queuedcall.call, agentcall, complete: ( adopt = false ) => {

      queuedcall.signalconfirm()
      this._fifoupdate( queuedcall )

      queuedcall.destroy()

      if( adopt && !request.queuedcall.destroyed ) {
        request.queuedcall.adopt( agentcall, true )
        agentcall.update()
      }

      this._talking++
      /*
        When the agent finishes the call this is when we mark the queued call as finished -  although it may continue.
        We could use other metrics - such as unnmix or caller call ending - but the callers call might be continued after
        the agent conversation, or unmix might happen when a call is placed on hold.
      */
      const cleanupcall = () => {
        this._talking--
        this.#emitfifohangup( queuedcall.call )
      }

      if( !queuedcall.call.destroyed ) queuedcall.call.on( "call.destroyed", cleanupcall )
      else if( !agentcall.destroyed ) agentcall.on( "call.destroyed", cleanupcall )
      else cleanupcall()

      /* we are now talking but have left the queue - the talking metric will be managed above. */
      queuedcall.call.vars.fifo.counts = {
        "waiting": this._callcount,
        "talking": this._talking,
        "agent": Object.keys( this._agents ).length
      }

      queuedcall.call.emit( "fifo.leave", queuedcall.call )
      this._options.em.emit( "fifo.leave", queuedcall.call )
    } }

    /* if no handler - we call back immediatly */
    if( queuedcall.call.vars.fifo.preconnect ) queuedcall.call.vars.fifo.preconnect( request )
    else request.complete( true )
  }

  /**
  Callback function to newuac - before we setup a bridge
  @param { object } agentcall
  @private
  */
  _enterpriseallprebridge( agentcall ) {

    this.#clearenterpriseagentcalls( agentcall.hangupcodes.LOSE_RACE )

    const queuedcall = this._getnextcaller( true )
    if( !queuedcall ) return

    agentcall.bond( queuedcall.call )

    return queuedcall
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
    /* 
      this._callcount == callers waiting 
      this._enterpriseoutboundcalls - all calls are added to this - talking and waiting
    */
    if( 0 === this._callcount ) return
    if( ( this._enterpriseoutboundcalls.size - this._talking ) >= this._callcount ) return /* 2. */
    const nextcall = this._getnextcaller()
    if( !nextcall ) return

    /* get next agent - the oldest by age of when we last called them */
    let agents = Object.values( this._agents ).filter( a => "available" === a.state )
    agents = agents.sort( ( a, b ) => { return a.last - b.last } )

    const newuac = () => {

      if( 0 === this._callcount ) return
      if( ( this._enterpriseoutboundcalls.size - this._talking ) >= this._callcount ) return /* 2. */
      if( 0 == agents.length ) return
      const agent = agents.shift()
      agent.last = + new Date
      agent.state = "early"

      /**
       * 
       * @param { object } a 
       */
      const attempt = ( a ) => {
        const options = {
          "headers": {
            "Max-Forwards": "0"
          },
          "uactimeout": this._options.uactimeout,
          "entity": {
            "uri": a.uri,
            "max": 1
          },
          "orphan": true,
          "late": true
        }
  
        if( nextcall._options.callerid ) {
          options.callerid = nextcall._options.callerid
        }
  
        nextcall.call.newuac( options, {
          "prebridge": this._enterpriseallprebridge.bind( this ),
          "early": this._enterpriseallearly.bind( this ),
          "confirm": this._enterpriseallconfirm.bind( this ),
          "fail": () => {
            a.state = "available"
            newuac()
          }
        } )
      }

      attempt( agent )
    }

    newuac()
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
  * Adds an agent to this queue
  * @param { string } agent - agent i.e. "1000@dummy.com"
  * @param { object } agentinfo
  * @returns { boolean } true if the agent has been added or false otherwise
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

  get name() {
    return this._name
  }

  /**
   *Set the mode to either "ringall" or "enterprise"
   @param { "ringall" | "enterprise" } m - the mode
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

  stats() {
    this._options.em.emit( "fifo.stats", this.getstats() )
  }

  getstats() {
    return {
      "name": this._name,
      "domain": this._domain.name,
      "waiting": this._callcount,
      "talking": this._talking,
      "agent": Object.keys( this._agents ).length
    }
  }
}



module.exports = fifo
