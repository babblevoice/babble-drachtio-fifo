
const expect = require( "chai" ).expect
const fifo = require( "../../index.js" )

describe( "interface index.js", function() {
  it( "create main fifo", async function() {
    const options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    const mainfifo = fifo.create( options )

    /* private members */
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_options" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_domains" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_allagents" )
    expect( mainfifo ).to.be.a( "object" ).to.have.property( "_agentlag" ).to.equal( 10 )
  } )

  it( "add agent to a fifo", async function() {

    const options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    const mainfifo = fifo.create( options )
    
    const agentinfo = { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agent": "1000@dummy.com"
    }

    mainfifo.addagent( agentinfo )

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 1 )

    // @ts-ignore
    const privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( "add agents to a fifo", async function() {

    const options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    const mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com" ]
    } )

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 2 )

    // @ts-ignore
    const privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( "add agents in multiple domains to fifos", async function() {

    const options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    const mainfifo = fifo.create( options )

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

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 3 )

    // @ts-ignore
    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    // @ts-ignore
    privateagentinfo = mainfifo._allagents.get( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    // @ts-ignore
    privateagentinfo = mainfifo._allagents.get( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( "delete an agent in multiple domains to fifos", async function() {

    const options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    const mainfifo = fifo.create( options )

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

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 3 )

    mainfifo.deleteagent( { 
      "name": "testfifo",
      "domain": "dummy.com",
      "agent": "1001@dummy.com"
    } )

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 2 )

    // @ts-ignore
    let privateagentinfo = mainfifo._allagents.get( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@dummy.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

    // @ts-ignore
    privateagentinfo = mainfifo._allagents.get( "1001@dummy.com" )
    expect( privateagentinfo ).to.be.undefined

    // @ts-ignore
    privateagentinfo = mainfifo._allagents.get( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "uri" ).to.equal( "1000@blah.com" )
    expect( privateagentinfo ).to.be.a( "object" ).to.have.property( "state" ).to.equal( "available" )
    expect( privateagentinfo.fifos.size ).to.equal( 1 ) /* a member of one fifo */

  } )

  it( "replace all agents by calling sync function", async function() {
    const options = {
      "srf": {},
      "agentlag": 10 /* mS - test */
    }

    const mainfifo = fifo.create( options )

    mainfifo.addagents( { 
      "name": "fifotest",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1001@dummy.com", "1002@dummy.com" ]
    } )

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 3 )

    /* sync rather than add */
    mainfifo.agents( {
      "name": "fifotest",
      "domain": "dummy.com",
      "agents": [ "1000@dummy.com", "1005@dummy.com" ]
    } )

    // @ts-ignore
    expect( mainfifo._allagents.size ).to.equal( 2 )

  } )
} )