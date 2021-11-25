
const crypto = require( "crypto" )

let dialogcount = 0

class dialog {

  constructor( uri ) {
    this.sip = {
      "callId": "ourdialog_" + dialogcount,
      "localTag": crypto.randomBytes( 4 ).toString( "hex" ),
      "remoteTag": crypto.randomBytes( 4 ).toString( "hex" )
    }

    this.local = {
      "uri": uri,
      "sdp": "somesdp"
    }

    this.remote = {
      "uri": uri,
      "sdp": "somesdp"
    }

    dialogcount++
  }

  destroy() {

  }

  modify() {

  }

  request() {

  }

  static create() {
    return new dialog()
  }

  static stats() {
    return { dialogcount }
  }

  static reset() {
    dialogcount = 0
  }
}

module.exports = dialog
