
const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../lib/fifo.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )


describe( "interface fifo.js", function() {
  it( `Create object`, async function() {
    let f = fifo.create()
    expect( f ).to.have.property( "_fifos" ).that.is.a( "Array" )
  } )

  it( `Queue a ringall - 2 agents and registrar then abandon`, async function() {
    /*
    Add agents but don't supply a registrar so it will fail - we
    should still queue and clean up well on hangup. This should finish
    cleanly without leaving unresolved promises/timers.
    */
    let options = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10000
    }

    let f = fifo.create( options )

    options.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    options.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    f.agents( {
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    /* mocks */
    let call = {
      "uuid": "1",
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "vars": {}
    }

    let waiting = f.queue( { call } )

    call._em.emit( "call.hangup", call )

    let reason
    await waiting
      .catch( ( e ) => {
        reason = e
      } )

    expect( reason ).to.equal( "abandoned" )
  } )

  it( `Queue a ringall - 2 agents and registrar multiple call attempts plus final timeout`, async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /*
    Add agents but don't supply a registrar so it will fail - we
    should still queue and clean up well on hangup. This should finish
    cleanly without leaving unresolved promises/timers.
    */

    let options = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "uacretrylag": 10 /* mS */
    }

    let f = fifo.create( options )

    options.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    options.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    f.agents( {
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    /* mocks */
    let call = {
      "uuid": "1",
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "vars": {}
    }

    let reason
    await f.queue( { call, "timeout": 1 } )
      .catch( ( e ) => {
        reason = e
      } )

    /*
      2 agents with 20mS per call (10 ringing 10 lag) in a 1S test
      (1000x2)/20 = 100
      include a good margin of error for timing errors
    */
    expect( options.srf.createduacs.length ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )
  } )
} )