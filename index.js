const soap = require('soap');
const SsrsSoap = require('./lib/soap');
const ReportManager = require('./lib/report');
const ReportService = require('./lib/reportService');
const ReportExecution = require('./lib/reportExecution');
const ReportExecutionUrl = require('./lib/reportExecutionUrl');

module.exports = {
    soap, SsrsSoap,
    ReportManager, ReportService,
    ReportExecution, ReportExecutionUrl,
};