const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )


describe( "interface enterprisescenarios.js", function() {
  it( `main enterprise queue 1 call`, async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    let globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )
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

      }

      static inboundcallcount = 0
      static newcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }
      _killcalls( callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, globaloptions.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    let qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "enterprise",
      "timeout": 1
    }

    /* now back to our inbound call */
    let reason = await mainfifo.queue( qitem )

    expect( qitem.call.vars.fifo.epochs.leave - qitem.call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitem.call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.within( 45, 55 )
    expect( reason ).to.equal( "timeout" )

    /* ensure the calls are split between agents */
    expect( mockagentcall.agenturicalls.filter( ( v ) => v === "1000@dummy.com" ).length ).to.be.within( 23, 28 )
    expect( mockagentcall.agenturicalls.filter( ( v ) => v === "1001@dummy.com" ).length ).to.be.within( 23, 28 )

  } )

  it( `main enterprise queue 2 calls`, async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    let globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )
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
      }

      static inboundcallcount = 0
      static newcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }
      _killcalls( callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, globaloptions.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    let qitems = [ {
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
    let waitforfirst = mainfifo.queue( qitems[ 0 ] )
    let waitforsecond = mainfifo.queue( qitems[ 1 ] )

    /* now back to our inbound call */
    let reason = await waitforfirst
    let reason2 = await waitforsecond

    expect( qitems[ 0 ].call.vars.fifo.epochs.leave - qitems[ 0 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 0 ].call.vars.fifo.state ).to.equal( "timeout" )
    expect( qitems[ 1 ].call.vars.fifo.epochs.leave - qitems[ 1 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 1 ].call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )
    expect( reason2 ).to.equal( "timeout" )

    /* ensure the calls are split between agents */
    expect( mockagentcall.agenturicalls.filter( ( v ) => v === "1000@dummy.com" ).length ).to.be.within( 48, 52 )
    expect( mockagentcall.agenturicalls.filter( ( v ) => v === "1001@dummy.com" ).length ).to.be.within( 48, 52 )

  } )
} )