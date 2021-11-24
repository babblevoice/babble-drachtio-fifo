

const expect = require( "chai" ).expect
const events = require( "events" )

const fifo = require( "../../lib/fifo.js" )


describe( "fifo.js", function() {

  it( `Create object`, async function() {
    let f = fifo.create()
    expect( f ).to.have.property( "_fifos" ).that.is.a( "Array" )
  } )

  it( `Queue a ringall`, async function() {
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
debugger
    call._em.emit( "call.hangup", call )

    expect( f._fifos[ 4 ] ).to.be.a( "array" ).to.have.lengthOf( 0 )
    expect( f._callcount ).to.equal( 0 )
  } )
} )
