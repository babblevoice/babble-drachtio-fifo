const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )


describe( "interface enterprisescenarios.js", function() {
  it( "main enterprise queue 1 call", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    let hangupcode
    class mockagentcall {

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )

        this.hangupcodes = {
          USER_GONE: "USER_GONE"
        }

        this.establish = false
        this.state = { establishing: false }
        this.vars = {}
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
      static last = ""

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
        expect( mockinboundcall.last ).to.not.equal( options.entity.uri )
        mockinboundcall.last = options.entity.uri
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

  it( "main enterprise queue 1 call agent declined", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    let hangupcode
    class mockagentcall {

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )

        this.hangupcodes = {
          USER_GONE: "USER_GONE"
        }

        this.establish = false
        this.state = { establishing: false }
        this.vars = {}
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
      static last = ""

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
          agentcall.hangup( { "reason": "DECLINED", "sip": 603 } )
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, globaloptions.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        expect( mockinboundcall.last ).to.not.equal( options.entity.uri )
        mockinboundcall.last = options.entity.uri
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

  it( "main enterprise queue 2 calls 1", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    let hangupcode
    class mockagentcall {

      static agenturicalls = []
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        mockagentcall.agenturicalls.push( uri )

        this.hangupcodes = {
          USER_GONE: "USER_GONE"
        }

        this.establish = false
        this.state = { establishing: false }
        this.vars = {}
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

  it( "main enterprise queue 2 abandon 1", async function() {
    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    class mockagentcall {

      static lastcreated
      constructor( uri, parent, callbacks ) {
        this.uri = uri
        this._em = new events.EventEmitter()
        this.parent = parent
        this._callbacks = callbacks

        mockagentcall.lastcreated = this /* parent is mockinboundcall */

        /* types we can request */
        this.hangupcodes = {
          "LOSE_RACE": "LOSE_RACE",
          "REQUEST_TIMEOUT": "REQUEST_TIMEOUT",
          "USER_GONE": "USER_GONE"
        }

        this.establish = false
        this.state = { establishing: false }
        this.vars = {}
      }

      hangup( reason ) {
        this.hangup_cause = reason
      }

      bond( parent ) {
        /* should be bonding not adopting - but store for test */
        this.parent = parent
      }

      get entity() {
        return ( async () => {
          return {
            "uri": this.uri,
            "ccc": 0 /* our tests ask this when we have finished */
          }
        } )()
      }

      update() {
        this.updatecalled = true
      }

      on( ev, cb ) {
        this._em.on( ev, cb )
      }

      async answer() {
        const cookie = await this._callbacks.prebridge( this )
        this._callbacks.confirm( this, cookie )
      }
    }

    class mockinboundcall {
      constructor() {
        this.uuid = "_" + mockinboundcall.inboundcallcount
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
      static newoutboundcallcount = 0

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

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          if( this.adoptcalled ) return
          /* these are emitted by callmanager - in this order */
          agentcall.hangup( { "reason": "REQUEST_TIMEOUT", "sip": 408 } )
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
      }

      adopt( childcall ) {
        this.adoptcalled = true
        this.child = childcall
      }

      mockhangupafter( timeout ) {
        setTimeout( () => {
          this._em.emit( "call.destroyed", this )
        }, timeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newoutboundcallcount++
        this._killcalls( options, callbacks, new mockagentcall( options.entity.uri, this, callbacks ) )
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

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 2 )

    qitems[ 0 ].call.mockhangupafter( 300 )
    
    const reason = await waitforfirst
    const reason2 = await waitforsecond

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 0 )

    expect( qitems[ 0 ].call.vars.fifo.epochs.leave - qitems[ 0 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 0 ].call.vars.fifo.state ).to.equal( "abandoned" )

    expect( reason ).to.equal( "abandoned" )
    expect( reason2 ).to.equal( "timeout" )

    expect( qitems[ 0 ].call.mockfifoupdates ).to.equal( 1 )
    expect( qitems[ 0 ].call.mockfifopositions[ 0 ] ).to.equal( 0 )

    expect( qitems[ 1 ].call.mockfifoupdates ).to.equal( 2 )
    expect( qitems[ 1 ].call.mockfifopositions[ 0 ] ).to.equal( 1 )
    expect( qitems[ 1 ].call.mockfifopositions[ 1 ] ).to.equal( 0 )

  } )

  it( "main enterprise queue 1 call and set caller id number", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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
          REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
          USER_GONE: "USER_GONE"
        }

        this.establish = false
        this.state = { establishing: false }
        this.vars = {}
      }

      hangup( reason ) {
        this.hangup_cause = reason
      }

      bond( parent ) {
        /* should be bonding not adopting - but store for test */
        this.parent = parent
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
      static lastoptions = {}

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
        mockinboundcall.lastoptions = options
      }
    }

    const qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "enterprise",
      "timeout": 1,
      "callerid": {
        "number": "0123456789"
      }
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

    expect( mockinboundcall.lastoptions.callerid.number ).to.equal( "0123456789" )

  } )

  it( "main enterprise queue 1 call and set caller id name", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
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
          REQUEST_TIMEOUT: "REQUEST_TIMEOUT"
        }

        this.establish = false
        this.state = { establishing: false }
        this.vars = {}
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

        this.hangupcodes = {
          SERVER_TIMEOUT: { "reason": "SERVER_TIMEOUT", "sip": 504 },
        }

      }

      static inboundcallcount = 0
      static newcallcount = 0
      static lastoptions = {}

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
        mockinboundcall.lastoptions = options
      }
    }

    const qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "enterprise",
      "timeout": 1,
      "callerid": {
        "name": "Queue"
      }
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

    expect( mockinboundcall.lastoptions.callerid.name ).to.equal( "Queue" )

  } )

  /* write tests to ensure REQUEST_TIMEOUT and other possible leave me alone hangup codes mean we move round the entrprise group */

} )