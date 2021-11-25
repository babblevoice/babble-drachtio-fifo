
const req = require( "./req.js" )
const dialog = require( "./dialog.js" )

class srf {
  constructor() {
    this.createduacs = []
  }

  async createUac( contact, uacoptions, progress ) {

    let r, re
    let promise = new Promise( ( resolve, reject ) => {
      r = resolve
      re = reject
    } )

    let invitereq = req.create()
    invitereq.mockoncancel( () => {
      re( { "status": 487 } )
    } )

    promise.index = this.createduacs.length
    this.createduacs.push( { contact, uacoptions, promise, "resolve": r, "reject": re, "settled": false, "req": invitereq } )

    if( progress && progress.cbRequest ) {
      progress.cbRequest( undefined, invitereq )
    }

    return promise
  }

  mockresolvedialog( index ) {
    if( !this.createduacs[ index ].settled ) {
      this.createduacs[ index ].settled = true
      this.createduacs[ index ].resolve( dialog.create( this.createduacs[ index ].contact ) )
    }
  }

  mockrejectdialog( index ) {
    if( !this.createduacs[ index ].settled ) {
      this.createduacs[ index ].settled = true
      this.createduacs[ index ].reject( { "status": 487 } )
    }
  }

  static create() {
    return new srf()
  }
}

module.exports = srf
