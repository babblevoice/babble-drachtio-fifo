
const expect = require( "chai" ).expect
const events = require( "events" )
const fifo = require( "../../index.js" )

const registrar = require( "../mock/registrar.js" )
const srf = require( "../mock/srf.js" )


describe( "interface index.js", function() {
  it( `create main fifo`, async function() {
    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    /* private members */
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_options" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_domains" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_allagents" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_agentlag" ).to.equal( 10 )
  } )

  it( `add agent to a fifo`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )
    
    let agentinfo = { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agent": "1000@dummy.com"
    }

    mainfifo.addagent( agentinfo )

    expect( mainfifo._allagents.size ).to.equal( 1 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `add agents to a fifo`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    expect( mainfifo._allagents.size ).to.equal( 2 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `add agents in multiple domains to fifos`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    mainfifo.addagent( { 
      "name": "fifotest",
      "domain": "blah.com",
      "agent": "1000@blah.com"
    } )

    expect( mainfifo._allagents.size ).to.equal( 3 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    privateagentinfo = mainfifo._allagents.get( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    privateagentinfo = mainfifo._allagents.get( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( `delete an agent in multiple domains to fifos`, async function() {

    let options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    let mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    mainfifo.addagent( { 
      "name": "fifotest",
      "domain": "blah.com",
      "agent": "1000@blah.com"
    } )

    expect( mainfifo._allagents.size ).to.equal( 3 )

    mainfifo.deleteagent( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agent": "1001@dummy.com"
    } )

    expect( mainfifo._allagents.size ).to.equal( 2 )

    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    privateagentinfo = mainfifo._allagents.get( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.undefined

    privateagentinfo = mainfifo._allagents.get( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )
} )