
const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )

describe( "interface agentlag.js", function() {
  /* move the agent lag into the agent definition */

  it( "main enterprise queue 1 call agentlag", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10 /* mS */
    }

    const mainfifo = fifo.create( globaloptions )

    mainfifo.agents( {
      "domain": "dummy.com",
      "name": "fifoname",
      "agentlag": 10,
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    class mockagentcall {

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )

        this.hangupcodes = {
          SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 },
        }
      }

      hangup( reason ) {
        this.hangup_cause = reason
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

    class mockinboundcall {
      constructor() {
        this.uuid = "" + mockinboundcall.inboundcallcount
        mockinboundcall.inboundcallcount++

        this._em = new events.EventEmitter()
        this.vars = {}

        this.hangupcodes = {
          SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 },
        }
      }

      static inboundcallcount = 0
      static newcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) {
      }

      _killcalls( callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall.hangup( { "reason": "REQUEST_TIMEOUT", "sip": 408 } )
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, globaloptions.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    const qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "enterprise",
      "timeout": 1
    }

    /* now back to our inbound call */
    const reason = await mainfifo.queue( qitem )

    expect( qitem.call.vars.fifo.epochs.leave - qitem.call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitem.call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.within( 45, 55 )
    expect( reason ).to.equal( "timeout" )

    /* ensure the calls are split between agents */
    expect( mockagentcall.agenturicalls.filter( ( v ) => "1000@dummy.com" === v ).length ).to.be.within( 23, 28 )
    expect( mockagentcall.agenturicalls.filter( ( v ) => "1001@dummy.com" === v ).length ).to.be.within( 23, 28 )

  } )

  it( "main enterprise queue 2 calls", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10 /* mS */
    }

    const mainfifo = fifo.create( globaloptions )

    let hangupcode

    mainfifo.agents( {
      "domain": "dummy.com",
      "name": "fifoname",
      "agentlag": 10,
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    class mockagentcall {

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )

        this.hangupcodes = {
          SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 },
        }
      }
      get entity() {
        return ( async () => {
          return {
            "uri": this.uri,
            "ccc": 0 /* our tests ask this when we have finished */
          }
        } )()
      }

      hangup( reason ) {
        this.hangup_cause = reason
      }

      on( ev, cb ) {
        this._em.on( ev, cb )
      }
    }

    class mockinboundcall {
      constructor() {
        this.uuid = "" + mockinboundcall.inboundcallcount
        mockinboundcall.inboundcallcount++

        this._em = new events.EventEmitter()
        this.vars = {}

        this.mockfifoupdates = 0
        this.mockfifopositions = []

        this.hangupcodes = {
          SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 },
        }
      }

      static inboundcallcount = 0
      static newcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }

      off( /*e, cb*/ ) {
      }

      emit( ev ) {
        if( "fifo.update" === ev || "fifo.enter" === ev ) {
          this.mockfifoupdates++
          this.mockfifopositions.push( this.vars.fifo.position )
        }
      }

      _killcalls( callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall.hangup( { "reason": "REQUEST_TIMEOUT", "sip": 408 } )
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, globaloptions.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    const qitems = [ {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "enterprise",
      "timeout": 1
    }, {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "enterprise",
      "timeout": 1
    } ]

    /* now back to our inbound call */
    const waitforfirst = mainfifo.queue( qitems[ 0 ] )
    const waitforsecond = mainfifo.queue( qitems[ 1 ] )

    /* now back to our inbound call */
    const reason = await waitforfirst
    const reason2 = await waitforsecond

    expect( qitems[ 0 ].call.vars.fifo.epochs.leave - qitems[ 0 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 0 ].call.vars.fifo.state ).to.equal( "timeout" )
    expect( qitems[ 1 ].call.vars.fifo.epochs.leave - qitems[ 1 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 1 ].call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )
    expect( reason2 ).to.equal( "timeout" )

    /* ensure the calls are split between agents */
    expect( mockagentcall.agenturicalls.filter( ( v ) => "1000@dummy.com" === v ).length ).to.be.within( 46, 54 )
    expect( mockagentcall.agenturicalls.filter( ( v ) => "1001@dummy.com" === v ).length ).to.be.within( 46, 54 )

    expect( qitems[ 0 ].call.mockfifoupdates ).to.equal( 1 )
    expect( qitems[ 1 ].call.mockfifoupdates ).to.equal( 2 )

    expect( qitems[ 1 ].call.mockfifopositions[ 0 ] ).to.equal( 1 )
    expect( qitems[ 1 ].call.mockfifopositions[ 1 ] ).to.equal( 0 )

  } )

} )