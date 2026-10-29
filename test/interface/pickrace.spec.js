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
        this.adopted = []
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
      /* this is the mix - who we end up hearing */
      adopt( other ) { this.adopted.push( other ) }
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
     * Drive the agent answering in callmanager's order. #setdialog marks the
     * leg established (and establishing) and only then does #onnewuacsuccess
     * run prebridge, bridge and confirm - so a leg is established for the
     * whole of the window this suite is about, and there is no state where a
     * leg is half way through answering with established still false.
     *
     * A leg that we have already hung up can still arrive here: a CANCEL and
     * the phone's 200 cross on the wire and the 200 wins. That is how an
     * agent ends up answering a call we thought we had cleared.
     * @param { object } leg
     */
    const answerleg = async ( leg ) => {
      /* the 200 won the race, so whatever CANCEL we sent did not take - the
         leg really is up and the agent really is listening */
      leg.agentcall.hangup_cause = undefined
      leg.agentcall.state.establishing = true
      leg.agentcall.established = true
      const cookie = await leg.callbacks.prebridge( leg.agentcall )
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

    /* an intercept takes the caller out of the queue */
    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 10 ) )

    /* the agent's 200 crossed our CANCEL and answers anyway - this is the
       window the 20/08 call landed in, 1.08s between the pick and the
       agent's media arriving */
    for( const leg of ringing ) await h.answerleg( leg )

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

    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 10 ) )

    /* the 200 crossed our CANCEL, so the agent answers regardless */
    for( const leg of ringing ) await h.answerleg( leg )

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


  /*
    The crossed call as it actually happens (SIP-227, ticket 47995).

    _enterpriseallprebridge pops the caller out of the queue and bonds it to
    the answering agent, but bond() only records a media-node affinity - it
    sets no parent/child, and marks nothing on the caller. So for the window
    between prebridge and the bridge completing, the caller is gone from the
    queue yet still looks entirely unclaimed to everybody else.

    An intercept landing in that window calls pick() on the caller. Our _pick
    then finds nothing in _calls, bails at "if ( !qc ) return" and so never
    clears the agent leg - which is still bonded and about to be mixed. The
    caller ends up mixed with two legs: the intercepting user and the agent.
    That is the double "mix" on one caller channel in the 20/08 and 01/09
    traces.
  */
  it( "releases an agent that claimed a caller an intercept then picked", async function() {

    this.timeout( 3000 )
    this.slow( 2000 )

    const h = harness( 1 )
    await new Promise( r => setTimeout( r, 60 ) )

    const leg = h.inflight()[ 0 ]
    expect( leg ).to.not.equal( undefined )

    /* the agent answers - prebridge pops the caller and bonds it to them */
    leg.agentcall.state.establishing = true
    const cookie = await leg.callbacks.prebridge( leg.agentcall )
    expect( leg.agentcall.bondedto, "prebridge did not claim the caller" )
      .to.equal( h.callers[ 0 ] )

    /* an intercept picks the same caller before the bridge is made */
    h.callers[ 0 ].emit( "call.pick", h.callers[ 0 ] )
    await new Promise( r => setTimeout( r, 20 ) )

    /* the agent leg is bonded to a caller who has just been taken, so it has
       to be given up - otherwise confirm mixes it in on top of the picker */
    expect( leg.agentcall.hangup_cause,
      "agent left bonded to a caller an intercept took - crossed call" )
      .to.not.equal( undefined )

    /* our hangup may not have taken by the time callmanager runs confirm, so
       confirm has to refuse on its own account - the caller must never be
       mixed with this agent on top of the picker */
    if( leg.callbacks.confirm ) await leg.callbacks.confirm( leg.agentcall, cookie )

    expect( h.callers[ 0 ].adopted, "agent mixed in on top of the picker" )
      .to.have.length( 0 )
  } )

} )
