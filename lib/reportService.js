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
    setItemDataSources: setItemDataSources,
    getItemReferences: getItemReferences,
    setItemReferences: setItemReferences
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

async function start(url, config, options, security) {
    try {
        if (!options) { options = {} }

        if (options.rootFolder) {
            soap.setRootFolder(options.rootFolder);
        }
        if (!options.skipSetServerUrl) { soap.setServerUrl(url); }

        url = /^https?:/.test(url) ? url + (options.useRs2012 ? asmx.rs2012 : asmx.rs2010) : url;
        var cli = await soap.createClient(url, config, security);
        reportService = cli;
        if (options.useRs2012) {
            for (var key in cli.ReportingService2012.ReportingService2012Soap)
                client[key] = promisify(cli.ReportingService2012.ReportingService2012Soap[key]);
        } else {
            for (var key in cli.ReportingService2010.ReportingService2010Soap)
                client[key] = promisify(cli.ReportingService2010.ReportingService2010Soap[key]);
        }
        return client;
    } catch (err) { report.errorHandler(err) }
}

async function getClient() { return client }
async function getDescription() { return reportService.describe() }

async function listChildren(reportPath, isRecursive) {
    try {
        var reports = await client.ListChildren({
            ItemPath: reportPath,
            Recursive: isRecursive
        });
        return reports.CatalogItems && reports.CatalogItems.CatalogItem;
    } catch (err) { report.errorHandler(err) }
}

async function getReportParams(reportPath, forRendering) {
    try {
        var result = await client.GetItemParameters({
            ItemPath: reportPath,
            ForRendering: forRendering || false
        });
        return result.Parameters && result.Parameters.ItemParameter;
    } catch (err) { report.errorHandler(err) }
}

async function updateReportParams(reportPath, params, formatParams) {
    try {
        if (formatParams) { params = reportExecution.formatParameters(params) }
        var result = await client.GetItemParameters({
            ItemPath: reportPath,
            Values: { ParameterValue: params },
            ForRendering: true
        });
        return result.Parameters && result.Parameters.ItemParameter;
    } catch (err) { report.errorHandler(err) }
}

// all DataSourceDefinition properties
// https://msdn.microsoft.com/en-us/library/reportservice2010.datasourcedefinition%28v=sql.120%29.aspx
async function testDataSourceConnection(userName, password, dataSourceDefinition) {
    try {
        var result = await client.TestConnectForDataSourceDefinition({
            DataSourceDefinition: dataSourceDefinition,
            UserName: userName,
            Password: password,
        });
        // throw error on ConnectError ????
        if (result.TestConnectForDataSourceDefinitionResult) {
            return result.TestConnectForDataSourceDefinitionResult
        } else {
            return result.ConnectError
        }
    } catch (err) { report.errorHandler(err) }
}

async function getProperties(reportPath, properties) {
    try {
        var props = [];
        if (properties) {
            if (typeof properties[0] === 'string') {
                for (var i = 0; i < properties.length; i++) { props.push({ Name: properties[i] }) }
                //props = properties.map(function (p) { return { Name: p } });
            } else props = properties;
        }

        //properties = [{ Name: 'Hidden' }, { Name: 'Description' }]
        var args = { ItemPath: reportPath };
        if (props.length) { args.Properties = { Property: props } }
        var result = await client.GetProperties(args);
        return result.Values.Property;
    } catch (err) { report.errorHandler(err) }
}

async function setProperties(reportPath, properties) {
    try {
        var props = [];
        if (!Array.isArray(properties)) {
            for (var key in properties)
                props.push({ Name: key, Value: properties[key] });
        } else props = properties;

        //properties = [{ Name: 'Hidden', Value: true }, { Name: 'Description', Value: true }]
        return await client.SetProperties({
            ItemPath: reportPath,
            Properties: { Property: props }
        });
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
        return Buffer.from(rdl.Definition, 'base64').toString().replace(/\0/g, '');
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
            Definition: Buffer.from(definition).toString('base64'),
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

async function createResource(name, path, fileContents, overwrite, mimeType) {
    try {
        var resource = await client.CreateCatalogItem({
            ItemType: 'Resource',
            Name: name,
            Parent: path,
            Overwrite: overwrite,
            Definition: fileContents,
            Properties: {
                Property: [{ Name: 'MimeType', Value: mimeType }]
            }
        });
        return resource.ItemInfo;
    } catch (error) { report.errorHandler(error) }
}

async function setItemDataSources(itemPath, dataSources) {
    try {
        var ds = [];
        if (Array.isArray(dataSources)) {
            ds = dataSources;
        } else {
            for (var key in dataSources)
                ds.push({ Name: key, DataSourceReference: { Reference: dataSources[key] } });
        }
        var result = await client.SetItemDataSources({
            ItemPath: itemPath,
            DataSources: { DataSource: ds }
        });
        return result;
    } catch (error) { report.errorHandler(error) }
}

async function getItemDataSources(itemPath) {
    try {
        var result = await client.GetItemDataSources({ ItemPath: itemPath });
        return result.DataSources.DataSource;
    } catch (error) { report.errorHandler(error) }
}

async function getItemReferences(itemPath, referenceItemType) {
    try {
        var result = await client.GetItemReferences({
            ItemPath: itemPath,
            ReferenceItemType: referenceItemType
        });
        return result.ItemReferences && result.ItemReferences.ItemReferenceData || [];
    } catch (error) { report.errorHandler(error) }
}

async function setItemReferences(itemPath, itemReferences) {
    try {
        var result = await client.SetItemReferences({
            ItemPath: itemPath,
            ItemReferences: { ItemReference: itemReferences }
        });
        return result;
    } catch (error) { report.errorHandler(error) }
}