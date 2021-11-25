

class req {
  constructor() {
    this._oncancel = false
    this._canceled = false
  }

  cancel() {
    this._canceled = true
    if( this._oncancel ) this._oncancel()
  }

  mockoncancel( cb ) {
    this._oncancel = cb
  }

  static create() {
    return new req()
  }
}

module.exports = req
