
var _ = require('lodash');

function NTLMSecurity(username, password, domain, workstation) {
  this.defaults = {
    username: username,
    password: password,
    domain: domain,
    workstation: workstation
  };
}

NTLMSecurity.prototype.addHeaders = function (headers) {

};

NTLMSecurity.prototype.toXML = function () {
  return '';
};

NTLMSecurity.prototype.addOptions = function (options) {
  _.merge(options, this.defaults);
};

module.exports = NTLMSecurity;
