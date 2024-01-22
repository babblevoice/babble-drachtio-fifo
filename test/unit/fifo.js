

const expect = require( "chai" ).expect
const events = require( "events" )

const fifo = require( "../../lib/fifo.js" )
const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )
const dialog = require( "../mock/dialog.js" )


describe( "unit fifo.js", function() {

  afterEach( function() {
    dialog.reset()
  } )

  it( "Queue a ringall - no agents", async function() {
    const f = fifo.create( "", {}, { _onqueueing: () => {} } )

    /* mocks */
    const call = {
      "uuid": "1",
      "hangupcodes": { USER_GONE: "USER_GONE" },
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "off": ( /*e, cb*/ ) => {},
      "emit": ( /*ev*/ ) => {},
      "vars": {}
    }

    f.queue( { call } )

    /* Default ringall, priority 5 (zero index based) */
    expect( f._fifos[ 4 ] ).to.be.a( "array" ).to.have.lengthOf( 1 )
    expect( f._fifos[ 3 ] ).to.be.a( "array" ).to.have.lengthOf( 0 )
    expect( f._callcount ).to.equal( 1 )

    expect( f._calls.has( call.uuid ) ).to.be.true

    call._em.emit( "call.destroyed", call )

    expect( f._fifos[ 4 ] ).to.be.a( "array" ).to.have.lengthOf( 0 )
    expect( f._callcount ).to.equal( 0 )
  } )


  it( "Queue a ringall - 2 agents", async function() {
    /*
    Add agents but don't supply a registrar so it will fail - we
    should still queue and clean up well on hangup. This should finish
    cleanly without leaving unresolved promises/timers.
    */
    const f = fifo.create( "", {}, { _onqueueing: () => {} } )

    const agentinfo = [ {
      "uri": "1000@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    }, {
      "uri": "1001@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    } ]

    f.addagent( "1000@dummy.com", agentinfo[ 0 ] )
    f.addagent( "1001@dummy.com", agentinfo[ 1 ] )

    /* mocks */
    const call = {
      "uuid": "1",
      "hangupcodes": { USER_GONE: "USER_GONE" },
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "off": ( /*e, cb*/ ) => {},
      "emit": ( /*ev*/ ) => {},
      "vars": {}
    }

    f.queue( { call } )

    call._em.emit( "call.destroyed", call )

    expect( agentinfo[ 0 ].fifos.size ).to.equal( 1 )
    expect( agentinfo[ 1 ].fifos.size ).to.equal( 1 )

  } )

  it( "add an agent", async function() {
    const f = fifo.create( "", {}, { _onqueueing: () => {} } )

    const agentinfo = {
      "fifos": new Set()
    }

    f.addagent( "1000@dummy.com", agentinfo )

    expect( f._agents ).to.have.property( "1000@dummy.com" )
    expect( agentinfo.fifos.size ).to.equal( 1 )
  } )

  it( "delete an agent", async function() {
    const f = fifo.create( "", {}, { _onqueueing: () => {} } )

    const agentinfo = [ {
      "uri": "1000@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    }, {
      "uri": "1001@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    } ]

    f.addagent( "1000@dummy.com", agentinfo[ 0 ] )
    f.addagent( "1001@dummy.com", agentinfo[ 1 ] )

    expect( agentinfo[ 0 ].fifos.size ).to.equal( 1 )
    expect( agentinfo[ 1 ].fifos.size ).to.equal( 1 )

    f.deleteagent( "1000@dummy.com" )

    expect( agentinfo[ 0 ].fifos.size ).to.equal( 0 )

    expect( f._agents ).to.not.have.property( "1000@dummy.com" )
    expect( f._agents ).to.have.property( "1001@dummy.com" )
  } )

  it ( "has agent", async function() {
    const f = fifo.create( "", {}, { _onqueueing: () => {} } )

    const agentinfo = [ {
      "uri": "1000@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    }, {
      "uri": "1001@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    }, {
      "uri": "1002@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    } ]

    f.addagent( "1000@dummy.com", agentinfo[ 0 ] )
    f.addagent( "1001@dummy.com", agentinfo[ 1 ] )
    f.addagent( "1002@dummy.com", agentinfo[ 2 ] )

    expect( f.hasagent( "1000@dummy.com" ) ).to.be.true
    expect( f.hasagent( "1001@dummy.com" ) ).to.be.true
    expect( f.hasagent( "1002@dummy.com" ) ).to.be.true
    expect( f.hasagent( "1003@dummy.com" ) ).to.be.false
  } )

  it( "Create object", async function() {
    const f = fifo.create( "", {}, { _onqueueing: () => {} } )
    expect( f ).to.have.property( "_fifos" ).that.is.a( "Array" )
  } )

  it( "Queue a ringall - 2 agents and registrar then abandon", async function() {
    /*
    Add agents but don't supply a registrar so it will fail - we
    should still queue and clean up well on hangup. This should finish
    cleanly without leaving unresolved promises/timers.
    */
    const options = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10000
    }

    const f = fifo.create( "", options, { _onqueueing: () => {} } )

    options.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    options.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    const agentinfo = [ {
      "uri": "1000@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    }, {
      "uri": "1001@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    } ]

    f.addagent( "1000@dummy.com", agentinfo[ 0 ] )
    f.addagent( "1001@dummy.com", agentinfo[ 1 ] )

    /* mocks */
    const call = {
      "uuid": "1",
      "hangupcodes": { USER_GONE: "USER_GONE" },
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "off": ( /*e, cb*/ ) => {},
      "emit": ( /*ev*/ ) => {},
      "vars": {}
    }

    const waiting = f.queue( { call } )

    call._em.emit( "call.destroyed", call )

    const reason = await waiting

    expect( call.vars.fifo.epochs.enter ).to.be.a( "number" ).to.be.above( 0 )
    expect( call.vars.fifo.epochs.leave ).to.be.a( "number" ).to.be.above( 0 )
    expect( call.vars.fifo.state ).to.equal( "abandoned" )
    expect( reason ).to.equal( "abandoned" )
  } )

  it( "Queue a ringall - 2 agents and registrar multiple call attempts plus final timeout", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /*
    Add agents but don't supply a registrar so it will fail - we
    should still queue and clean up well on hangup. This should finish
    cleanly without leaving unresolved promises/timers.
    */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
    }

    const f = fifo.create( "", globaloptions, { _onqueueing: () => {} } )

    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    const mockagentinfo = [ {
      "uri": "1000@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    }, {
      "uri": "1001@dummy.com",
      "fifos": new Set(),
      "state": "available",
      "callcount": 0
    } ]

    f.addagent( "1000@dummy.com", mockagentinfo[ 0 ] )
    f.addagent( "1001@dummy.com", mockagentinfo[ 1 ] )

    class mockagentcall {
      constructor( uri ) {
        this.uri = uri

        this._em = new events.EventEmitter()
      }
      get entity() {
        return ( async () => {
          return {
            "uri": this.uri
          }
        } )()
      }
    }

    const mockagentcalls = [
      new mockagentcall( "1000@dummy.com" ),
      new mockagentcall( "1001@dummy.com" )
    ]

    const mockagentindex = {
      "1000@dummy.com": 0,
      "1001@dummy.com": 1
    }

    let newcallcount = 0

    const mockinboundcall = {
      "uuid": "1",
      "hangupcodes": { SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 } },
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => mockinboundcall._em.on( e, cb ),
      "off": ( /*e, cb*/ ) => {},
      "emit": ( /*ev*/ ) => {},
      "vars": {},
      "newuac": function ( options, callbacks ) {
        newcallcount++

        const agentcall = mockagentcalls[ newcallcount % 2 ]
        callbacks.early( agentcall )

        setTimeout( () => {
          agentcall._em.emit( "call.destroyed", agentcall )
          /* this is called by our main module code so is mocked from that code */
          setTimeout( async () => {
            const entity = await agentcall.entity

            const mockagenti = mockagentinfo[ mockagentindex[ entity.uri ] ]
            
            mockagenti.callcount--
            if( 0 === mockagenti.callcount ) {
              mockagenti.state = "available"
            }
            
            f._callagents()
          }, globaloptions.agentlag )
          
        }, globaloptions.uactimeout )
      }
    }

    const waiting = f.queue( { "call": mockinboundcall, "timeout": 1 } )
    f._callagents() /* this is handled in our domain object - so this is not needed in real implimentation */
    const reason = await waiting
    /*
      The timing happens mostly in this test, however, this ensures agents are added back
      and all logic in the fifo is working.
      2 agents with 20mS per call (10 ringing 10 lag) in a 1S test
      (1000x2)/20 = 100
      include a good margin of error for timing errors
    */
    expect( mockinboundcall.vars.fifo.epochs.leave - mockinboundcall.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( mockinboundcall.vars.fifo.state ).to.equal( "timeout" )
    expect( newcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )
  } )

} )
