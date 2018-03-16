const soap = require('soap');

const report = require('./lib/report');
const reportService = require('./lib/reportService');
const reportExecution = require('./lib/reportExecution');

report.reportService = reportService;
report.reportExecution = reportExecution;
report.soap = soap;
module.exports = report;