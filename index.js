
const events = require( "events" )
const assert = require( "assert" ).strict

const domain = require( "./lib/domain.js" )

/**
Manage all of our fifos (queues), calls queueing and agents.
*/
class fifos {

  /**
  @param { object } options
  @param { object } options.srf - srf object
  @param { object } [ options.em ] - event emmitter
  @param { number } [ options.agentlag = 30000 ] - duration after last call to retry next new call (mS)
  */
  constructor( options ) {

    assert( options.srf, "You must supply an srf object" )

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
    let unorderedfifos = Array.from( agentinfo.fifos )

    let frontcalls = []
    for( const fifo of unorderedfifos ) {
      let nextcallforqueue = fifo._getnextcaller()
      if( nextcallforqueue ) frontcalls.push( nextcallforqueue )
    }

    /* oldest first */
    if( frontcalls.length > 1 )
      frontcalls.sort( ( a, b ) => { return b.age - a.age } )

    if( frontcalls.length > 0 )
      frontcalls[ 0 ]._fifo._callagents()
}

  /**
  Called by callmanager event emitter
  @param { call } call - our call object
  @private 
  */
  async _onentitymightbefree( call ) {
    let entity = await call.entity
    if( entity && 0 === entity.ccc ) {
      /* We know who it is and they have no other calls */
      if( this._allagents.has( entity.uri ) ) {
        let agent = this._allagents.get( entity.uri )
        if( "ringing" === agent.state || "busy" === agent.state ) {
          agent.state = "resting"
          setTimeout( () => {
            agent.state = "available"
            this._callagents( agent )
          }, this._agentlag )
        }
      }
    }
  }

  async _onentitymightbeavailable( reginfo ) {
    if( this._allagents.has( reginfo.auth.uri ) ) {
    }
  }

  async _onentitymightbeunavailable( reginfo ) {
    if( this._allagents.has( reginfo.auth.uri ) ) {
    }
  }

  /**
  Called by callmanager event emitter
  @param { call } call - our call object
  @private 
  */
  async _onentitybusy( call ) {
    let entity = await call.entity
    if( entity && entity.ccc > 0 ) {
      if( this._allagents.has( entity.uri ) ) {
        this._allagents.get( entity.uri ).state = "busy"
      }
    }
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
  queue( options ) {
    let d = this.getdomain( options.domain )
    return d.queue( options )
  }

  /**
  Sets the members of a queue
  @param { object } options
  @param { string } options.name - the name of the queue
  @param { string } options.domain - the domain for the queue
  @param { array.< string > } options.agents - array of agents i.e. [ "1000@dummy.com" ]
  */
  addagents( options ) {
    for( let agent of options.agents ) {
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
  */
  addagent( options ) {
    if( !options || !options.agent ) return

    let d = this.getdomain( options.domain )

    if( this._allagents.has( options.agent ) ) {
      let ouragent = this._allagents.get( options.agent )
      d.addagent( options, ouragent )
    } else {
      let ouragent = {
        "uri": options.agent,
        "fifos": new Set(),
        "state": "available",
        "callcount": 0
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
  @param { string } options.agents - agent i.e. [ "1000@dummy.com", "1001@dummy.com" ]
  */
  agents( options ) {

    /* first remove any agents not in our new list */
    let agents = {}
    for( let agent of options.agents ) {
      agents[ agent ] = true
    }

    let d = this.getdomain( options.domain )
    let f = d.getfifo( options.name )
    let currentagents = f.agents
    for( let currentagent of currentagents ) {
      if( !( currentagent in agents ) ) {
        this.deleteagent( {
          "name": options.name,
          "domain": options.domain,
          "agent": currentagent
         } )
      }
    }

    /* now add */
    for( let agent of options.agents ) {
      this.addagent( {
        "name": options.name,
        "domain": options.domain,
        "agent": agent
      } )
    }
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

    let d = this.getdomain( options.domain )

    if( this._allagents.has( options.agent ) ) {
      d.deleteagent( options )
      let agentinfo = this._allagents.get( options.agent )
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
