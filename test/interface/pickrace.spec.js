const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )

/*
  SIP-227. An enterprise queue dials its agent legs with "orphan": true, so a
  ringing leg is not a child of the caller - it is only tied to one at
  prebridge, when the agent answers. Two failures fall out of that, and both
  were reported by the same customer:

  1. Crossed call. An intercept picks a caller out of the queue, the legs
     ringing for that caller are left up, an agent answers a moment later and
     lands on a caller who is already talking to the picker.

  2. Silent call. An agent answers a leg for a caller who has already gone.
     prebridge finds nothing in the queue to hand it, and the agent is left on
     an answered call bonded to nobody - they pick up to silence.

  These tests drive a real agent answer (prebridge/confirm) rather than only
  checking that legs get hung up, because it is the answer that produces the
  symptom the customer sees.
*/
describe( "interface pickrace.js", function() {

  /**
   * An enterprise queue whose agent legs ring but only answer when the test
   * says so, so we can interleave an answer with a pick.
   * @param { number } callercount - how many callers to queue
   * @returns { object }
   */
  function harness( callercount ) {

    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 2000, /* long - we want legs to stay ringing */
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

    const legs = []

    class mockagentcall {
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        this.hangupcodes = {
          USER_GONE: "USER_GONE",
          PICKED_OFF: "PICKED_OFF",
          LOSE_RACE: "LOSE_RACE"
        }
        this.established = false
        this.state = { establishing: false }
        this.vars = {}
        this.hangup_cause = undefined
        this.bondedto = undefined
      }

      hangup( reason ) {
        this.hangup_cause = reason
        this._em.emit( "call.destroyed", this )
      }

      bond( other ) { this.bondedto = other }

      update() {}

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
      adopt() {}
      update() {}

      /* ring the agent - it answers only when the test calls answerleg() */
      newuac( options, callbacks ) {
        const agentcall = new mockagentcall( options.entity.uri )
        legs.push( { agentcall, callbacks } )
        callbacks.early( agentcall )
      }
    }

    const callers = []
    for( let i = 0; callercount > i; i++ ) {
      const call = new mockinboundcall()
      callers.push( call )
      mainfifo.queue( {
        "call": call,
        "name": "fifoname",
        "domain": "dummy.com",
        "mode": "enterprise",
        "timeout": 1
      } )
    }

    /**
     * Drive the agent answering, the way callmanager does: prebridge once the
     * dialog is up, then confirm once the bridge is made.
     * @param { object } leg
     */
    const answerleg = async ( leg ) => {
      leg.agentcall.state.establishing = true
      const cookie = await leg.callbacks.prebridge( leg.agentcall )
      leg.agentcall.state.establishing = false
      leg.agentcall.established = true
      if( leg.callbacks.confirm ) await leg.callbacks.confirm( leg.agentcall, cookie )
      return cookie
    }

    const inflight = () => legs.filter( l => undefined === l.agentcall.hangup_cause )

    return { mainfifo, callers, legs, inflight, answerleg }
  }

  it( "does not bond an answering agent to a caller an intercept already took", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )
    await new Promise( r => setTimeout( r, 60 ) )

    const ringing = h.inflight()
    expect( ringing.length ).to.be.above( 0 )

    /* the agent's phone has sent its 200 - this is the window the 20/08 call
       landed in, 1.08s between the pick and the agent's media arriving */
    for( const leg of ringing ) leg.agentcall.state.establishing = true

    /* an intercept takes the caller out of the queue */
    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 10 ) )

    /* the agent finishes answering a moment later */
    for( const leg of ringing ) {
      if( undefined !== leg.agentcall.hangup_cause ) continue
      await h.answerleg( leg )
    }

    for( const leg of ringing ) {
      expect( leg.agentcall.bondedto, "agent bonded to a caller already picked" )
        .to.not.equal( h.callers[ 0 ] )
    }
  } )

  it( "does not leave an answering agent on a silent call when the queue is empty", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )
    await new Promise( r => setTimeout( r, 60 ) )

    const ringing = h.inflight()
    expect( ringing.length ).to.be.above( 0 )

    /* mid-answer at the moment of the pick, so the leg survives it */
    for( const leg of ringing ) leg.agentcall.state.establishing = true

    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 10 ) )

    for( const leg of ringing ) {
      if( undefined !== leg.agentcall.hangup_cause ) continue
      await h.answerleg( leg )
    }

    /* an agent with no caller to bond to must be released, not left answered
       and bonded to nobody - that is what the agent hears as silence */
    for( const leg of ringing ) {
      if( undefined !== leg.agentcall.bondedto ) continue
      expect( leg.agentcall.hangup_cause, "agent left answered with no caller - silent call" )
        .to.not.equal( undefined )
    }
  } )

  it( "clears the in-flight agent leg when the only caller is picked", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )
    await new Promise( r => setTimeout( r, 60 ) )

    const ringing = h.inflight()
    expect( ringing.length ).to.be.above( 0 )

    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 20 ) )

    for( const leg of ringing ) {
      expect( leg.agentcall.hangup_cause ).to.equal( "PICKED_OFF" )
    }
  } )

  it( "clears an agent leg that is mid-answer when the caller is picked", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )
    await new Promise( r => setTimeout( r, 60 ) )

    const ringing = h.inflight()
    expect( ringing.length ).to.be.above( 0 )

    /* the phone has sent its 200 but we have not finished setting up */
    for( const leg of ringing ) leg.agentcall.state.establishing = true

    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 20 ) )

    for( const leg of ringing ) {
      expect( leg.agentcall.hangup_cause ).to.equal( "PICKED_OFF" )
    }
  } )

  it( "clears only the surplus agent legs when another caller is still waiting", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 2 )
    await new Promise( r => setTimeout( r, 80 ) )

    const ringing = h.inflight()
    expect( ringing.length ).to.be.above( 1 )

    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 20 ) )

    const stillringing = ringing.filter( l => undefined === l.agentcall.hangup_cause )

    /* one caller remains, so exactly one leg should still be ringing for them */
    expect( stillringing.length ).to.equal( 1 )
  } )

} )
