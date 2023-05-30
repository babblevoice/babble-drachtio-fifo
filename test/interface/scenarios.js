const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )


describe( "interface scenarios.js", function() {
  it( "main ringall queue 1 call", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
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
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
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

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) { 
      }

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( options, callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    const qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    }

    /* now back to our inbound call */
    const reason = await mainfifo.queue( qitem )

    expect( qitem.call.vars.fifo.epochs.leave - qitem.call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitem.call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )

  } )

  it( "main ringall queue 2 calls", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
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
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
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
      static newoutboundcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) {
      }

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newoutboundcallcount++
        this._killcalls( options, callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    const qitems = [ {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    }, {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    } ]

    /* now back to our inbound call */
    const waitforfirst = mainfifo.queue( qitems[ 0 ] )
    const waitforsecond = mainfifo.queue( qitems[ 1 ] )

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 2 )
    
    const reason = await waitforfirst
    const reason2 = await waitforsecond

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 0 )

    expect( qitems[ 0 ].call.vars.fifo.epochs.leave - qitems[ 0 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 0 ].call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newoutboundcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )
    expect( reason2 ).to.equal( "timeout" )

  } )

  it( "main ringall queue 2 answer 1", async function() {
    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
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

      answer() {
        this._callbacks.confirm( this )
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
      static newoutboundcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) {
      }

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
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
      "mode": "ringall",
      "timeout": 1
    }, {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    } ]

    /* now back to our inbound call */
    const waitforfirst = mainfifo.queue( qitems[ 0 ] )
    const waitforsecond = mainfifo.queue( qitems[ 1 ] )

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 2 )

    setTimeout( () => {
      mockagentcall.lastcreated.answer()
    }, 200 )
    
    const reason = await waitforfirst
    const reason2 = await waitforsecond

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 0 )

    expect( qitems[ 0 ].call.vars.fifo.epochs.leave - qitems[ 0 ].call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitems[ 0 ].call.vars.fifo.state ).to.equal( "confirm" )
    expect( mockinboundcall.newoutboundcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "confirm" )
    expect( reason2 ).to.equal( "timeout" )
  } )

  it( "main ringall queue 2 answer 2", async function() {
    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
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

      answer() {
        this._callbacks.confirm( this )
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
      static newoutboundcallcount = 0

      on( e, cb ) {
        this._em.on( e, cb )
      }

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) {
      }

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
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
      "mode": "ringall",
      "timeout": 1
    }, {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    } ]

    /* now back to our inbound call */
    const waitforfirst = mainfifo.queue( qitems[ 0 ] )
    const waitforsecond = mainfifo.queue( qitems[ 1 ] )

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 2 )

    setTimeout( () => {
      mockagentcall.lastcreated.answer()
    }, 200 )

    setTimeout( () => {
      mockagentcall.lastcreated.answer()
    }, 600 )
    
    const reason = await waitforfirst
    const reason2 = await waitforsecond

    expect( mainfifo.getdomain( "dummy.com" ).getfifo( "fifoname" ).size ).to.equal( 0 )

    expect( qitems[ 0 ].call.vars.fifo.epochs.leave - qitems[ 0 ].call.vars.fifo.epochs.enter ).to.be.below( 1 ) /* S */
    expect( qitems[ 0 ].call.vars.fifo.state ).to.equal( "confirm" )

    /*
    600mS queueing time
    ring time 10mS, agentlag 10mS, 2 phones
    600 / ( ( 10 + 10 ) / 2 ) = 60 ( add allowance of 10 either way )
    */
    expect( mockinboundcall.newoutboundcallcount ).to.be.within( 50, 70 )
    expect( reason ).to.equal( "confirm" )
    expect( reason2 ).to.equal( "confirm" )
  } )

  it( "main ringall queue 2 abandon 1", async function() {
    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
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
          "REQUEST_TIMEOUT": "REQUEST_TIMEOUT"
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

      update() {
        this.updatecalled = true
      }

      on( ev, cb ) {
        this._em.on( ev, cb )
      }

      answer() {
        this._callbacks.confirm( this )
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
          /* these are emitted by callmanager - in this order */
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
      "mode": "ringall",
      "timeout": 1
    }, {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
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


  it( "main ringall queue a call then add agent", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
    }

    const mainfifo = fifo.create( globaloptions )

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    class mockagentcall {
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
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

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) { 
      }

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( options, callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    const qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    }

    setTimeout( () => {
      mainfifo.agents( {
        "domain": "dummy.com",
        "name": "fifoname",
        "agents": [ "1000@dummy.com", "1001@dummy.com" ]
      } )
    }, 1 )

    /* now back to our inbound call */
    const reason = await mainfifo.queue( qitem )

    expect( qitem.call.vars.fifo.epochs.leave - qitem.call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitem.call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.within( 90, 110 )
    expect( reason ).to.equal( "timeout" )

  } )

  it( "main ringall queue a call then remove agent", async function() {

    this.timeout( 2000 )
    this.slow( 1500 )

    /* create a global fifo object */
    const globaloptions = {
      "registrar": registrar.create(),
      "srf": srf.create(),
      "uactimeout": 10, /* mS */
      "agentlag": 10
    }

    const mainfifo = fifo.create( globaloptions )

    /* setup our mock interfaces */
    globaloptions.registrar.addmockcontactinfo( "1000@dummy.com", { "contacts": [ "sip:1@d.c" ] } )
    globaloptions.registrar.addmockcontactinfo( "1001@dummy.com", { "contacts": [ "sip:1@e.c" ] } )

    class mockagentcall {
      constructor( uri ) {
        this.uri = uri
        this._em = new events.EventEmitter()
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

      off( /*e, cb*/ ) {
      }

      emit( /*ev*/ ) { 
      }

      _killcalls( options, callbacks, agentcall ) {
        callbacks.early( agentcall )

        setTimeout( () => {
          /* these are emitted by callmanager - in this order */
          agentcall._em.emit( "call.destroyed", agentcall )
          globaloptions.em.emit( "call.destroyed", agentcall )
          
        }, options.uactimeout )
      }

      newuac( options, callbacks ) {
        mockinboundcall.newcallcount++
        this._killcalls( options, callbacks, new mockagentcall( options.entity.uri ) )
      }
    }

    const qitem = {
      "call": new mockinboundcall(),
      "name": "fifoname",
      "domain": "dummy.com",
      "mode": "ringall",
      "timeout": 1
    }

    mainfifo.agents( {
      "domain": "dummy.com",
      "name": "fifoname",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    setTimeout( () => {
      mainfifo.agents( {
        "domain": "dummy.com",
        "name": "fifoname",
        "agents": []
      } )
    }, 1 )

    /* now back to our inbound call */
    const reason = await mainfifo.queue( qitem )

    expect( qitem.call.vars.fifo.epochs.leave - qitem.call.vars.fifo.epochs.enter ).to.be.below( 3 ) /* 1S */
    expect( qitem.call.vars.fifo.state ).to.equal( "timeout" )
    expect( mockinboundcall.newcallcount ).to.be.below( 5 )
    expect( reason ).to.equal( "timeout" )

  } )
} )