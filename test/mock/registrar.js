


class registrar {
  constructor() {
    this._contactinfo = {}
  }

  /* not registrar functions */
  addmockcontactinfo( user, contactinfo ) {
    this._contactinfo[ user ] = contactinfo
  }

  async contacts( user ) {
    return this._contactinfo[ user ]
  }

  static create() {
    return new registrar()
  }
}

module.exports = registrar
