// TODO: replace with original soap once ntlm support is added
const soapntlm = require('soap-ntlm-2');

const soap = require('./lib/soap');
const report = require('./lib/report');
const reportService = require('./lib/reportService');
const reportExecution = require('./lib/reportExecution');

report.soap = soap;
report.reportService = reportService;
report.reportExecution = reportExecution;
report.security = soapntlm.security;
module.exports = report;
