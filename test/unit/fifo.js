

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

  it( `Queue a ringall - no agents`, async function() {
    let f = fifo.create()

    /* mocks */
    let call = {
      "uuid": "1",
      "_em": new events.EventEmitter(),
      "on": ( e, cb ) => call._em.on( e, cb ),
      "vars": {}
    }

    f.queue( { call } )

    /* Default ringall, priority 5 (zero index based) */
    expect( f._fifos[ 4 ] ).to.be.a( "array" ).to.have.lengthOf( 1 )
    expect( f._fifos[ 3 ] ).to.be.a( "array" ).to.have.lengthOf( 0 )
    expect( f._callcount ).to.equal( 1 )

    expect( f._calls.has( call.uuid ) ).to.be.true

    call._em.emit( "call.hangup", call )

    expect( f._fifos[ 4 ] ).to.be.a( "array" ).to.have.lengthOf( 0 )
    expect( f._callcount ).to.equal( 0 )
  } )


  it( `Queue a ringall - 2 agents`, async function() {
    /*
    Add agents but don't supply a registrar so it will fail - we
    should still queue and clean up well on hangup. This should finish
    cleanly without leaving unresolved promises/timers.
    */
    let f = fifo.create()

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

    f.queue( { call } )

    call._em.emit( "call.hangup", call )

  } )

} )
