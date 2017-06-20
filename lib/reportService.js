module.exports = {
    start: start,
    getClient: getClient,
    getDescription: getDescription,
    listChildren: listChildren,
    getReportParams: getReportParams,
    updateReportParams: updateReportParams,
    testDataSourceConnection: testDataSourceConnection,
    getProperties: getProperties,
    setHidden: setProperties,
    listJobs: listJobs,
    cancelJob: cancelJob,
    getItemDefinition: getItemDefinition,
    createFolder: createFolder,
    createDataSource: createDataSource,
    createReport: createReport,
    deleteItem: deleteItem,
    createResource: createResource,
    getItemDataSources: getItemDataSources,
    setItemDataSources: setItemDataSources
}

const soap = require('./soap');
const report = require('./report');
const reportExecution = require('./reportExecution');
const asmx = {
    rs2010: "/ReportService2010.asmx",
    rs2012: "/ReportService2012.asmx"
};
var client = {};
var reportService;

function promisify(fn) {
    return function () {
        var args = Array.from(arguments);
        return new Promise((resolve, reject) => fn(...args, (error, content) => error ? reject(error) : resolve(content)));
    };
}

async function start(url, auth, security, useRs2010) {
    try {
        var cli = await soap.createClient(url + (useRs2010 ? asmx.rs2010 : asmx.rs2012), auth, security);
        reportService = cli;
        if (useRs2010) {
            for (var key in cli.ReportingService2010.ReportingService2010Soap)
                client[key] = promisify(cli.ReportingService2010.ReportingService2010Soap[key]);
        } else {
            for (var key in cli.ReportingService2012.ReportingService2012Soap)
                client[key] = promisify(cli.ReportingService2012.ReportingService2012Soap[key]);
        }
        return client;
    } catch (err) { report.errorHandler(err) }
}

async function getClient() { return client }
async function getDescription() { return reportService.describe() }

async function listChildren(reportPath, isRecursive) {
    try {
        var reports = await client.ListChildren({ ItemPath: reportPath, Recursive: isRecursive });
        return reports.CatalogItems && reports.CatalogItems.CatalogItem;
    } catch (err) { report.errorHandler(err) }
}

async function getReportParams(reportPath, forRendering) {
    try {
        var result = await client.GetItemParameters({ ItemPath: reportPath, ForRendering: forRendering || false });
        return result.Parameters && result.Parameters.ItemParameter;
    } catch (err) { report.errorHandler(err) }
}

async function updateReportParams(reportPath, params, formatParams) {
    try {
        if (formatParams) { params = reportExecution.formatParameters(params) }
        var result = await client.GetItemParameters({ ItemPath: reportPath, ForRendering: true, Values: { ParameterValue: params } });
        return result.Parameters && result.Parameters.ItemParameter;
    } catch (err) { report.errorHandler(err) }
}

// all DataSourceDefinition props https://msdn.microsoft.com/en-us/library/reportservice2010.datasourcedefinition%28v=sql.120%29.aspx
async function testDataSourceConnection(userName, password, dataSourceDefinition) {
    try {
        var config = {
            UserName: userName,
            Password: password,
            DataSourceDefinition: dataSourceDefinition
        };
        var result = await client.TestConnectForDataSourceDefinition(config);
        if (result.TestConnectForDataSourceDefinitionResult) {
            return result.TestConnectForDataSourceDefinitionResult
        } else {
            return result.ConnectError
        }
    } catch (err) { report.errorHandler(err) }
}

async function setProperties(reportPath, properties) {
    try {
        var props = [];
        if (typeof properties[0] === 'string') {
            for (var key in properties) { props.push({ Name: key }) }
        } else props = properties;

        //properties = [{ Name: 'Hidden', Value: true }, { Name: 'Description', Value: true }]
        return await client.SetProperties({ ItemPath: reportPath, Properties: { Property: properties } });
    } catch (err) { errorHandler(err) }
}

async function getProperties(reportPath, properties) {
    try {
        var props = [];
        if (!Array.isArray(properties)) {
            for (var key in properties)
                props.push({ Name: key, Value: properties[key] });
        } else props = properties;

        var props = await client.GetProperties({ ItemPath: reportPath, Properties: { Property: props } });
        return props.Values.Property;
    } catch (err) { report.errorHandler(err) }
}

async function listJobs() {
    try {
        var jobs = await client.ListJobs();
        return jobs.Jobs;
    } catch (err) { report.errorHandler(err) }
}

async function cancelJob(jobId) {
    try {
        if (!jobId) { throw "Job id required!"; }
        var result = await client.CancelJob({ JobId: jobId });
        return result.Jobs;
    } catch (err) { report.errorHandler(err) }
}

async function getItemDefinition(reportPath) {
    try {
        var rdl = await client.GetItemDefinition({ ItemPath: reportPath });
        return new Buffer(rdl.Definition, 'base64').toString();
    } catch (error) { report.errorHandler(error) }
}

async function createFolder(folderName, path) {
    try {
        return await client.CreateFolder({ Folder: folderName, Parent: path });
    } catch (error) { report.errorHandler(error) }
}

async function createDataSource(dataSourceName, folder, overwrite, definition, description, isHidden) {
    try {
        var result = await client.CreateDataSource({
            DataSource: dataSourceName, // The name for the data source including the file name and, in SharePoint mode, the extension (.rsds).
            Parent: folder, // The fully qualified URL for the parent folder that will contain the data source.
            Overwrite: overwrite || false, // indicates whether an existing data source with the same name in the location specified should be overwritten.
            Definition: definition, // A DataSourceDefinition object that describes the connection properties for the data source.
            // An array of Property objects that defines the property names and values to set for the data source.
            Properties: {
                Property: [
                    { Name: 'Description', Value: description },
                    { Name: 'Hidden', Value: isHidden || false }
                ]
            },
        })
        return result.ItemInfo;
    } catch (error) { report.errorHandler(error) }
}

async function createReport(reportName, folder, overwrite, definition, description, isHidden) {
    try {
        var newReport = await client.CreateCatalogItem({
            ItemType: 'Report',
            Name: reportName,
            Parent: folder,
            Overwrite: overwrite || false,
            Definition: definition,
            Properties: {
                Property: [
                    { Name: 'Description', Value: description },
                    { Name: 'Hidden', Value: isHidden || false }
                ]
            }
        });
        return newReport.ItemInfo;
    } catch (error) { report.errorHandler(error) }
}

async function deleteItem(path) {
    try {
        return await client.DeleteItem({ ItemPath: path });
    } catch (error) { report.errorHandler(error) }
}

async function createResource(path, fileContents, mimeType) {
    try {
        var resource = await client.CreateResource(name, parent, true, fileContents, mimeType);
        return resource;
    } catch (error) { report.errorHandler(error) }
}

async function setItemDataSources(itemPath, dataSources) {
    try {
        var ds = [];
        for (var key in dataSources)
            ds.push({ Name: key, DataSourceReference: dataSources[key] });
        var result = await client.SetItemDataSources({ ItemPath: itemPath, DataSources: { DataSource: ds } });
        return result;
    } catch (error) { report.errorHandler(error) }
}

async function getItemDataSources(itemPath) {
    try {
        var result = await client.GetItemDataSources({ ItemPath: itemPath });
        return result.DataSources.DataSource;
    } catch (error) { report.errorHandler(error) }
}