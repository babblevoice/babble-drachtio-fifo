const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )

/*
  SIP-XXX: an enterprise queue dials its agent legs with "orphan": true, so a
  ringing agent leg is not a child of the caller. When an intercept picks the
  caller out of the queue, nothing in the call graph links the two - so the
  surplus agent legs have to be cleared by the fifo itself. If they are not,
  the agent answers a moment later and lands on a caller who is already
  talking to the picker: a crossed call.
*/
describe( "interface pickrace.js", function() {

  /**
   * Build a harness with an enterprise queue whose agent legs ring but never
   * answer, so we can inspect what happens to them when a caller is picked.
   * @param { number } callercount - how many callers to queue
   * @returns { object }
   */
  function harness( callercount ) {

    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 2000, /* long - we want the legs to stay ringing */
      "agentlag": 10,
      "agentretry": 10,
      "minlag": 10
    }

    const mainfifo = fifo.create( globaloptions )

    mainfifo.agents( {
      "domain": "dummy.com",
      "name": "fifoname",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    const agentcalls = []

    class mockagentcall {
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        this.hangupcodes = { USER_GONE: "USER_GONE", PICKED_OFF: "PICKED_OFF" }
        this.established = false
        this.state = { establishing: false }
        this.vars = {}
        this.hangup_cause = undefined
        agentcalls.push( this )
      }

      hangup( reason ) {
        this.hangup_cause = reason
        this._em.emit( "call.destroyed", this )
      }

      get entity() {
        return ( async () => { return { "uri": this.uri, "ccc": 0 } } )()
      }

      on( ev, cb ) { this._em.on( ev, cb ) }
    }

    class mockinboundcall {
      constructor() {
        this.uuid = "caller" + mockinboundcall.inboundcallcount
        mockinboundcall.inboundcallcount++
        this._em = new events.EventEmitter()
        this.vars = {}
        this.destroyed = false
        this.hangupcodes = {
          SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 },
          PICKED_OFF: "PICKED_OFF"
        }
      }

      static inboundcallcount = 0

      on( e, cb ) { this._em.on( e, cb ) }
      off( e, cb ) { this._em.off( e, cb ) }
      emit( e, v ) { this._em.emit( e, v ) }

      /* ring the agent but never answer or fail - it stays in flight */
      newuac( options, callbacks ) {
        const agentcall = new mockagentcall( options.entity.uri )
        callbacks.early( agentcall )
      }
    }

    const callers = []
    const queued = []
    for( let i = 0; callercount > i; i++ ) {
      const call = new mockinboundcall()
      callers.push( call )
      queued.push( mainfifo.queue( {
        "call": call,
        "name": "fifoname",
        "domain": "dummy.com",
        "mode": "enterprise",
        "timeout": 1
      } ) )
    }

    return { mainfifo, callers, queued, agentcalls, globaloptions }
  }

  it( "clears the in-flight agent leg when the only caller is picked", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )

    /* let the agent lag elapse so a leg is ringing */
    await new Promise( r => setTimeout( r, 60 ) )
    expect( h.agentcalls.length ).to.be.above( 0 )

    const inflight = h.agentcalls.filter( a => undefined === a.hangup_cause )
    expect( inflight.length ).to.be.above( 0 )

    /* an intercept picks the caller out of the queue */
    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )

    await new Promise( r => setTimeout( r, 20 ) )

    /* every leg that was ringing for this caller must now be torn down */
    for( const agentcall of inflight ) {
      expect( agentcall.hangup_cause ).to.equal( "PICKED_OFF" )
    }
  } )

  it( "clears an agent leg that is mid-answer when the caller is picked", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )

    await new Promise( r => setTimeout( r, 60 ) )
    const inflight = h.agentcalls.filter( a => undefined === a.hangup_cause )
    expect( inflight.length ).to.be.above( 0 )

    /* the phone has sent its 200 but we have not finished setting up */
    for( const agentcall of inflight ) agentcall.state.establishing = true

    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )

    await new Promise( r => setTimeout( r, 20 ) )

    for( const agentcall of inflight ) {
      expect( agentcall.hangup_cause ).to.equal( "PICKED_OFF" )
    }
  } )

  it( "clears only the surplus agent legs when another caller is still waiting", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 2 )

    await new Promise( r => setTimeout( r, 80 ) )

    const inflight = h.agentcalls.filter( a => undefined === a.hangup_cause )
    expect( inflight.length ).to.be.above( 1 )

    /* pick one of the two callers - the other is still waiting */
    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )

    await new Promise( r => setTimeout( r, 20 ) )

    const stillringing = inflight.filter( a => undefined === a.hangup_cause )

    /* one caller remains, so at most one leg should still be ringing for them */
    expect( stillringing.length ).to.be.at.most( 1 )
    /* and we must not have torn down everything - the waiting caller needs a leg */
    expect( stillringing.length ).to.equal( 1 )
  } )

} )
