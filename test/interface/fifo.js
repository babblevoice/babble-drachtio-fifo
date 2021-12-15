
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

    let agentinfo = [ {
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
    let call = {
      "uuid": "1",
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "vars": {}
    }

    let waiting = f.queue( { call } )

    call._em.emit( "call.hangup", call )

    let reason = await waiting

    expect( call.vars.fifo.epochs.enter ).to.be.a( "number" ).to.be.above( 0 )
    expect( call.vars.fifo.epochs.leave ).to.be.a( "number" ).to.be.above( 0 )
    expect( call.vars.fifo.state ).to.equal( "abandoned" )
    expect( reason ).to.equal( "abandoned" )
  } )
} )