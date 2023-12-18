
const events = require( "events" )

const domain = require( "./lib/domain.js" )

/**
Manage all of our fifos (queues), calls queueing and agents.
*/
class fifos {

  /**
  @param { object } options
  @param { object } options.srf - srf object
  @param { object } [ options.em ] - event emmitter
  @param { number } [ options.uactimeout = 60000 ] - default uactimeout (mS)
  @param { number } [ options.agentlag = 30000 ] - duration after last call to retry next new call (mS)
  */
  constructor( options ) {

    /**
    @private
    */
    this._options = options

    if( !this._options.em ) {
      this._options.em = new events.EventEmitter()
    }

    this._options.em.on( "call.destroyed", this._onentitymightbefree.bind( this ) )
    this._options.em.on( "register", this._onentitymightbeavailable.bind( this ) )

    this._options.em.on( "unregister", this._onentitymightbeunavailable.bind( this ) )
    this._options.em.on( "call.new", this._onentitybusy.bind( this ) )
    this._options.em.on( "call.authed", this._onentitybusy.bind( this ) )

    /**
    @private
    */
    this._domains = new Map()

    /**
    Each agent has the structure
    {
      "uri": "1000@dummy.com",
      "fifos": Set(),
      "state": "busy" - "busy|ringing|resting|available",
      "callcount": 0
    }
    The key is the uri
    @private
    */
    this._allagents = new Map()

    /**
    @private
    */
    this._agentlag = 30000
    if( options && options.agentlag ) this._agentlag = options.agentlag
  }

  /**
  Trigger a call from the next most important queue (based on oldest next)
  */
  _callagents( agentinfo ) {
    const unorderedfifos = Array.from( agentinfo.fifos )

    const frontcalls = []
    for( const fifo of unorderedfifos ) {
      const nextcallforqueue = fifo._getnextcaller()
      if( nextcallforqueue ) frontcalls.push( nextcallforqueue )
    }

    /* oldest first */
    if( 1 < frontcalls.length )
      frontcalls.sort( ( a, b ) => { return b.age - a.age } )

    if( 0 < frontcalls.length )
      frontcalls[ 0 ]._fifo._callagents()
  }

  /**
  Called by callmanager event emitter
  @param { object } call - our call object
  @private 
  */
  async _onentitymightbefree( call ) {
    const entity = await call.entity
    if( entity && 0 === entity.ccc ) {
      /* We know who it is and they have no other calls */
      if( this._allagents.has( entity.uri ) ) {
        const agent = this._allagents.get( entity.uri )

        if( "available" == agent.state || "ringing" === agent.state || "busy" === agent.state ) {
          agent.state = "resting"
          setTimeout( () => {
            agent.state = "available"
            this._callagents( agent )
          }, agent.agentlag )
        }
      }
    }
  }

  async _onentitymightbeavailable( reginfo ) {
    if( this._allagents.has( reginfo.auth.uri ) && reginfo.initial ) {
      const agent = this._allagents.get( reginfo.auth.uri )
      agent.state = "available"
      this._callagents( agent )
    }
  }

  async _onentitymightbeunavailable( /*reginfo*/ ) {
    //if( this._allagents.has( reginfo.auth.uri ) ) {
    //}
  }

  /**
  Called by callmanager event emitter
  @param { object } call - our call object
  @private 
  */
  async _onentitybusy( call ) {
    const entity = await call.entity
    if( entity && 0 < entity.ccc ) {
      if( this._allagents.has( entity.uri ) ) {
        this._allagents.get( entity.uri ).state = "busy"
      }
    }
  }

  /**
  Queue a call with options
  @param { object } options
  @param { object } options.call
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { number } [ options.timeout = 3600 ] - the max time to hold the call in the queue
  @param { number } [ options.priority = 5 ] - the priority - 1-10 - the lower the higher the priority
  @param { string } [ options.mode = "ringall" ] - or "enterprise"
  @returns { Promise } - resolves when answered or fails.
  */
  queue( options ) {
    const d = this.getdomain( options.domain )
    return d.queue( options )
  }

  /**
  Sets the members of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { Array.< string > } options.agents - array of agents i.e. [ "1000@dummy.com" ]
  */
  addagents( options ) {
    for( const agent of options.agents ) {
      this.addagent( {
        "name": options.name,
        "domain": options.domain,
        agent
      } )
    }
  }

  /**
  Add a member to a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  @param { number } [ options.agentlag ] - agent wrapup lag
  */
  addagent( options ) {
    if( !options || !options.agent ) return

    const d = this.getdomain( options.domain )

    if( this._allagents.has( options.agent ) ) {
      const ouragent = this._allagents.get( options.agent )
      if( undefined != options.agentlag ) ouragent.agentlag = options.agentlag
      d.addagent( options, ouragent )
    } else {

      let lag = this._agentlag
      if( "agentlag" in options ) lag = options.agentlag
      if( typeof lag !== "number" ) lag = this._agentlag

      const ouragent = {
        "uri": options.agent,
        "fifos": new Set(),
        "state": "available",
        "callcount": 0,
        "last": 0,
        "agentlag": lag
      }

      this._allagents.set( options.agent, ouragent )

      if( !d.addagent( options, ouragent ) ) {
        /* this shouldn't happen */
        this._allagents.delete( options.agent )
      }
    }
  }

  /**
  Sets the agents to this list miantaining current state
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { number } [ options.agentlag ] - agent wrapup lag
  @param { Array.< string > } options.agents - agent i.e. [ "1000@dummy.com", "1001@dummy.com" ]
  */
  agents( options ) {

    /* first remove any agents not in our new list */
    const agents = {}
    for( const agent of options.agents ) {
      agents[ agent ] = true
    }

    const d = this.getdomain( options.domain )
    const f = d.getfifo( options.name )
    const currentagents = f.agents
    for( const currentagent of currentagents ) {
      if( !( currentagent in agents ) ) {
        this.deleteagent( {
          "name": options.name,
          "domain": options.domain,
          "agent": currentagent
        } )
      }
    }

    /* now add */
    for( const agent of options.agents ) {
      this.addagent( {
        "name": options.name,
        "domain": options.domain,
        "agentlag": options.agentlag,
        "agent": agent
      } )
    }

    f.stats()
  }

  /**
  Removes a member froma queue. If the agent is not a member of any other
  queue clean up.
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { string } options.agent - agent i.e. "1000@dummy.com"
  */
  deleteagent( options ) {
    if( !options || !options.agent ) return

    const d = this.getdomain( options.domain )

    if( this._allagents.has( options.agent ) ) {
      d.deleteagent( options )
      const agentinfo = this._allagents.get( options.agent )
      if( 0 === agentinfo.fifos.size ) {
        this._allagents.delete( options.agent )
      }
    }
  }

  /**
  Create or return a domain object containing a domains fifos.
  @param { string } domainname
  @return { domain }
  */
  getdomain( domainname ) {

    if( this._domains.has( domainname ) ) {
      return this._domains.get( domainname )
    }

    const newdomain = domain.create( this._options )
    this._domains.set( domainname, newdomain )
    newdomain.name = domainname
    return newdomain
  }

  /**
   * 
   * @return { Array< any > }
   */
  getdomains() {
    return [ ...this._domains.keys() ]
  }

  /**
  Shortcut to create fifos.
  */
  static create( options ) {
    return new fifos( options )
  }
}


module.exports = fifos
