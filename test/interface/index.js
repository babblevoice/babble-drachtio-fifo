
const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )


describe( "interface index.js", function() {
  it( `create main fifo`, async function() {
    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    /* private members */
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_options" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_domains" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_allagents" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_agentlag" ).to.equal( 10 )
  } )

  it( `add agent to a fifo`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )
    
    let agentinfo = { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agent": "1000@dummy.com"
    }

    mainfifo.addagent( agentinfo )

    expect( mainfifo._allagents.size ).to.equal( 1 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `add agents to a fifo`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    expect( mainfifo._allagents.size ).to.equal( 2 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `add agents in multiple domains to fifos`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    mainfifo.addagent( { 
      "name": "fifotest",
      "domain": "blah.com",
      "agent": "1000@blah.com"
    } )

    expect( mainfifo._allagents.size ).to.equal( 3 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    privateagentinfo = mainfifo._allagents.get( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    privateagentinfo = mainfifo._allagents.get( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `delete an agent in multiple domains to fifos`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    mainfifo.addagent( { 
      "name": "fifotest",
      "domain": "blah.com",
      "agent": "1000@blah.com"
    } )

    expect( mainfifo._allagents.size ).to.equal( 3 )

    mainfifo.deleteagent( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agent": "1001@dummy.com"
    } )

    expect( mainfifo._allagents.size ).to.equal( 2 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    privateagentinfo = mainfifo._allagents.get( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.undefined

    privateagentinfo = mainfifo._allagents.get( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `replace all agents by calling sync function`, async function() {
    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "fifotest",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com", "1002@dummy.com" ]
    } )

    expect( mainfifo._allagents.size ).to.equal( 3 )

    /* sync rather than add */
    mainfifo.agents( {
      "name": "fifotest",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1005@dummy.com" ]
    } )

    expect( mainfifo._allagents.size ).to.equal( 2 )

  } )

  it( `main ringall queue 1 call`, async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    let globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "uacretrylag": 10, /* mS */
      "agentlag": 10
    }

    let mainfifo = fifo.create( globaloptions )

    mainfifo.agents( {
      "domain": "dummy.com",
      "name": "fifoname",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    class mockagentcall {
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
      }
      get entity() {
        return ( async () => {
          return {
            "uri": this.uri,
            "ccc": 0 /* our tests ask this when we have finished */
          }
        } )()
      }

      on( ev, cb ) {
        this._em.on( ev, cb )
      }
    }

    let newcallcount = 0

    function killcalls( callbacks, agentcall ) {
      callbacks.early( agentcall )

      setTimeout( () => {
        /* these are emitted by callmanager - in this order */
        agentcall._em.emit( "call.destroyed", agentcall )
        globaloptions.em.emit( "call.destroyed", agentcall )
        
      }, globaloptions.uactimeout )
    }

    class mockinboundcall {
      constructor() {
        this.uuid = "" + mockinboundcall.inboundcallcount
        mockinboundcall.inboundcallcount++

        this._em = new events.EventEmitter()
        this.vars = {}

      }

      static inboundcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }

      newuac( options, callbacks ) {
        newcallcount++
        killcalls( callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    let qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    }

    /* now back to our inbound call */
    let reason = await mainfifo.queue( qitem )

    expect( qitem.call.vars.fifo.epochs.leave - qitem.call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitem.call.vars.fifo.state ).to.equal( "timeout" )
    expect( newcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )

  } )
} )