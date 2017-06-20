module.exports = {
    start: start,
    getClient: getClient,
    getDescription: getDescription,
    listRenderingExtensions: listRenderingExtensions,
    getReport: getReport,
    getReportByUrl: getReportByUrl,
}

const moment = require('moment');
const httpntlm = require('httpntlm');

const soap = require('./soap');
const report = require('./report');

const asmx = "/ReportExecution2005.asmx";
var client = {};
var reportExecution;

function promisify(fn) {
    return function () {
        var args = Array.from(arguments);
        return new Promise((resolve, reject) => fn(...args, (error, content) => error ? reject(error) : resolve(content)));
    };
}

async function start(url, options, security) {
    try {
        var cli = await soap.createClient(url + asmx, options);
        reportExecution = cli;
        for (var key in cli.ReportExecutionService.ReportExecutionServiceSoap)
            client[key] = promisify(cli.ReportExecutionService.ReportExecutionServiceSoap[key]);
        return client;
    } catch (err) { report.errorHandler(err) }
}

async function getClient() { return client }
async function getDescription() { return reportExecution.describe() }

async function listRenderingExtensions() {
    try {
        var result = await client.ListRenderingExtensions();
        return result.Extensions.Extension;
    } catch (err) { report.errorHandler(err) }
}

function testReportPath(reportPath) {
    var rootFolder = soap.getRootFolder();
    return new RegExp('^' + rootFolder).test(reportPath) ? reportPath : rootFolder + reportPath;
}

function reportFormat(fileType) {
    var fileType = fileType && fileType.toUpperCase() || 'PDF';
    switch (fileType) {
        case 'EXCELOPENXML': case 'EXCEL': return 'EXCELOPENXML';
        case 'WORDOPENXML': case 'WORD': return 'WORDOPENXML';
        default: return fileType
    }
}

async function getReport(reportPath, fileType, params) {
    try {
        reportPath = testReportPath(reportPath);
        fileType = reportFormat(fileType);
        // Loads a report from the report server into a new execution.
        var execInfo = await client.LoadReport({ "Report": reportPath });
        // clear previous header
        reportExecution.clearSoapHeaders();
        // hack for soap to include in header otherwise request fails
        var executionHeader = { ExecutionHeader: { ExecutionID: execInfo[2].ExecutionHeader.ExecutionID } };
        reportExecution.addSoapHeader(executionHeader, 'nume', 'h', 'http://schemas.microsoft.com/sqlserver/2005/06/30/reporting/reportingservices');

        // Sets and validates parameter values associated with the current report execution.
        var execParams = await reportExecution.SetExecutionParameters({ "Parameters": { "ParameterValue": formatParameters(params) } });

        // Sets and validates parameter values associated with the current report execution. + set start of ExecutionTime
        //var execParams = yield reportExecution.SetExecutionParameters({ "Parameters": { "ParameterValue": formatParameters(params) }, "ExecutionDateTime": new Date() });

        // Processes a specific report and renders it in the specified format.
        var report = await client.Render({ "Format": fileType });

        return report.Result;
    } catch (err) { report.errorHandler(err) }
}

/**
 * name = case sensitive
 * parameters must be formated like => [{ Name: name, Value: value }]  
 * 
 * multivalue [{ Name: sameName, Value: [] }] =>
 * [
 *      { Name: sameName, Value: value1 },
 *      { Name: sameName, Value: value2 }
 * ]
 */
function formatParameters(params) {
    if (Array.isArray(params)) {
        return arrayToReport(params);
    } else {
        return objectToReport(params);
    }
}

/**
 * [{ Name: nume, Value: valoare }]
 */
function arrayToReport(params, checkNulls) {
    var formated = [];
    for (var i = 0; i < params.length; i++) {
        if (params[i].ParameterTypeName === "DateTime" || params[i].Value instanceof Date) {
            formated.push({ Name: params[i].Name, Value: moment(params[i].Value).format("MM/DD/YYYY") });
        } else if ((params[i].AllowBlank === true || params[i].Nullable === true) && (!params[i].Value || params[i].Value === undefined)) {
            formated.push({ Name: params[i].Name, Value: undefined });
        } else if (checkNulls && (!params[i].AllowBlank || !params[i].Nullable) && (!params[i].Value || params[i].Value === undefined)) {
            throw "Parameter " + params[i].Name + " undefined";
        } else if (Array.isArray(params[i].Value)) {
            if (!params[i].Value.length)
                formated.push({ Name: params[i].Name, Value: null });
            if (params[i].Value.length === 1 && params[i].Value[0] === "all validValues") {
                for (var j = 0; j < params[i].ValidValues.ValidValue.length; j++) {
                    formated.push({ Name: params[i].Name, Value: params[i].ValidValues.ValidValue[j].Value });
                }
            } else {
                for (var j = 0; j < params[i].Value.length; j++) {
                    formated.push({ Name: params[i].Name, Value: params[i].value[j] });
                }
            }
        } else {
            formated.push({ Name: params[i].Name, Value: params[i].Value });
        }
    }
    return formated;
}

/**
 *  { field: value }
 * 
 * for multivalue { sameField: [value1, value2] } =>
 * [
 *      { Name: sameField, Value: value1 },
 *      { Name: sameField, Value: value2 }
 * ]
 */
function objectToReport(params) {
    var formated = [];
    for (var key in params) {
        if (params[key] instanceof Date && !isNaN(params[key].valueOf())) {
            formated.push({ Name: key, Value: momment(params[key]).format("MM/DD/YYYY") });
        } else if (Array.isArray(params[key])) {
            if (!params[key].length) {
                formated.push({ Name: params[key], Value: undefined });
            } else {
                for (var i = 0; i < params[key].length; i++) {
                    formated.push({ Name: key, Value: params[key][i] });
                }
            }
        } else {
            formated.push({ Name: key, Value: params[key] });
        }
    }
    return formated;
}

async function getReportByUrl(reportPath, fileType, params, auth) {
    try {
        var config = {
            binary: true, // very important
            username: auth.userName,
            password: auth.password,
            workstation: auth.workstation,
            domain: auth.domain,
            url: soap.getServerUrl()
            + "?" + testReportPath(reportPath)
            + "&rs:Command=Render&rs:Format=" + reportFormat(fileType)
            + "&" + formatParamsToUrl(params)
        };
        var result = await httpntlm.post(config);
        return result.body; // return stream ???
    } catch (err) { report.errorHandler(err) }
}

/**
 * param1=value1&param2=value2&param3=value3
 * 
 * for multiple params {sameName: [...]}
 * sameName=value1%2Cvalue2
 */
function formatParamsToUrl(params) {
    var urlParts = [];
    // [{Name: nume, Value: valoare}]
    if (Array.isArray(params)) {
        for (var i = 0; i < params.length; i++) {
            if (params[i].ParameterTypeName === "DateTime") {
                urlParts.push(params[i].Name + "=" + moment(params[i].Value).format("MM.DD.YYYY"));
            } else if (Array.isArray(params[i].Value)) {
                // result paramName=paramValue1%2CparamValue2%2CparamValue3
                var parts = [];
                for (var j = 0; j < params[i].Value.length; j++)
                    parts.push(params[i].Value[j].Value);
                urlParts.push(params[i].Name + "=" + parts.join('%2C'));
                // var url = urlParts.push(parts.join(','));
                // urlParts.push(params[i].Name + "=" + encodeURIComponent(url));
            } else {
                urlParts.push(params[i].Name + "=" + params[i].Value);
            }
        }
        // { name: value }
    } else {
        for (var key in params) {
            if (params[key] instanceof Date && !isNaN(params[key].valueOf())) {
                urlParts.push(key + "=" + momment(params[key]).format("MM/DD/YYYY"));
            } else if (Array.isArray(params[key])) {
                // result paramName=paramValue1%2CparamValue2%2CparamValue3
                var parts = [];
                for (var j = 0; j < params[key].length; j++)
                    parts.push(params[key][j]);
                urlParts.push(params[key] + "=" + parts.join('%2C'));
                // var url = urlParts.push(parts.join(','));
                // urlParts.push(params[i].Name + "=" + encodeURIComponent(url));
            } else {
                urlParts.push(key + "=" + params[key].Value);
            }
        }
    }
    return urlParts.join('&');
}