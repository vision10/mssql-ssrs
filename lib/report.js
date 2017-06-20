module.exports = {
    start: startServices,
    getReportList: getReportList,
    cacheReportList: cacheReportList,
    createReportCopy: createReportCopy,
    reportBuilder: reportBuilder,
    clearCache: clearCache,
    download: download,
    upload: upload,
    uploadFiles: uploadFiles,
    errorHandler: errorHandler
}

const fs = require('fs');
const moment = require('moment');
const soap = require('./soap');
const reportService = require('./reportService');
const reportExecution = require('./reportExecution');

var isCacheable = false;
var cache = {};

function errorHandler(err) {
    var message = err && err.root && err.root.Envelope && err.root.Envelope.Body && err.root.Envelope.Body.Fault.faultstring || err.message;
    throw new Error(message);
}

async function startServices(urlOrServerConfig, auth, options, security) {
    options = options || {};
    soap.setRootFolder(options.rootFolder);
    soap.setServerUrl(urlOrServerConfig);
    var url = soap.getServerUrl();
    await reportService.start(url, auth, security, !options.useRs2010);
    await reportExecution.start(url, auth, security);
    if (!options.cache) {
        isCacheable = !options.cache;
        await cacheReportList();
    }
}

function clearCache() {
    for (var key in cache) { delete cache[key] }
}

async function getReportList(reportPath, forceRefresh) {
    if (!isCacheable) {
        if ((!reportPath || reportPath === soap.getRootFolder()) && !forceRefresh) {
            return cache
        } else if (reportPath in cache && !forceRefresh) {
            return cache[reportPath]
        } else {
            await cacheReportList(reportPath);
            return cache[key];
        }
    } else {
        return await reportService.listChildren(reportPath)
    }
}

async function cacheReportList(reportPath, keepHidden) {
    reportPath = (reportPath || soap.getRootFolder());
    var reports = await reportService.listChildren(reportPath, true);

    for (var i = 0; i < reports.length; i++) {
        if (reports[i].TypeName === "DataSource") { continue; }
        if (reports[i].TypeName === "Folder") {
            reportPath = reports[i].Path.substr(reports[i].Path.lastIndexOf("/"));
            cache[reportPath] = [];
        } else if (reports[i].TypeName === "ReportItem") {
            if (keepHidden) {
                cache[reportPath].push(reports[i]);
            } else {
                // eliminate hidden reports
                var properties = await reportService.getProperties(reports[i].Path, { Name: 'Hidden' })
                if (properties[0] && properties[0].Name === "Hidden" && (!properties[0].Value || properties[0].Value === "False")) {
                    cache[reportPath].push(reports[i]);
                }
            }
        }
    }
}

async function reportBuilder(reportPath) {
    return soap.getServerUrl() + '/ReportBuilder/ReportBuilder_3_0_0_0.application?ReportPath=' + (reportPath || '/');
}

async function createReportCopy(reportPath, options) {
    var reportName = reportPath.substr(reportPath.lastIndexOf("/") + 1);
    var reportFolder = reportPath.substr(0, reportPath.lastIndexOf("/"));

    if (reportName.indexOf("_custom_") != -1) {
        reportName = reportName.substring(0, reportName.lastIndexOf("_") + 1) + moment().format("DDMMYYTHHmm");
    } else {
        reportName = reportName + "_custom_" + moment().format("DDMMYYTHHmm");
    }

    var definition = await reportService.getItemDefinition(reportPath);
    var newReport = await reportService.createReport(
        options.name || reportName,
        options.parent || reportFolder,
        options.overwrite || false,
        definition,
        options.description,
        options.hidden
    );

    if (!isCacheable) {
        clearCAche();
        cacheReportList();
    }

    return newReport;
}

async function download(reportPath) {
    if (!Array.isArray(reportPath)) reportPath = [reportPath];
    var files = [];
    while (reportPath.length) {
        var result = await listChildren(reportPath.shift(), true);
        for (var i = 0; i < result.length; i++) {
            var file = { name: result[i].Name, path: result[i].Path, type: result[i].TypeName, definition: null };
            if (result[i].TypeName !== 'Folder') {
                file.definition = await reportService.getItemDefinition(result[i].Path);
            }
            files.push(file);
        }
    }
    return files;
}

async function uploadFiles(sourcePath, targetPath, options) {
    var files = read(sourcePath, []);
    return await upload(targetPath || sourcePath.substring(sourcePath.lastIndexOf('/')), options, files);
}

function read(sourcePath, files) {
    var dir = fs.readdirSync(sourcePath);
    for (var i = 0; i < dir.length; i++) {
        var path = sourcePath + '/' + dir[i];
        if (fs.statSync(path).isDirectory()) {
            files.push({ name: dir[i], path: path, type: 'Folder' });
            read(path, files);
        } else {
            var content = fs.readFileSync(path).toString();
            var type = dir[i].substring(dir[i].lastIndexOf('.')) == '.rds' ? 'DataSource' : 'Report';
            var name = dir[i].substring(0, dir[i].lastIndexOf('.'))
            files.push({ name: name, path: path, type: type, definition: content });
        }
    }
    return files;
}

async function upload(reportPath, options, files) {
    var warrnings = [], options = options || {};

    // Create folder if it doesn't exist, 
    // ignore if it does or user doesn't have permission to create it, keep as warrning.
    try {
        var parts = reportPath.split('/');
        await reportService.createFolder(parts.pop(), '/' + parts.join('/'));
    } catch (error) { warrnings.push(error) }

    if (options.deleteReports) {
        // Iterate through each report in the target folder deleting them
        var reports = await reportService.listChildren(reportPath, true);
        for (var i = 0; i < reports.length; i++) {
            if (reports[i].Type === 'Report') {
                try {
                    reportService.deleteItem(reports[i].Path);
                } catch (error) { warrnings.push(error) }
            }
        }
    }

    var dataSources = [];
    reportPath = /^\//.test(reportPath) ? reportPath.substr(1) : reportPath;
    for (var i = 0; i < files.length; i++) {
        try {
            var path = newPath(files[i].path, reportPath, true);
            if (files[i].type === 'Folder') {
                await reportService.createFolder(files[i].name, path);
            } else if (files[i].type === 'DataSource') {
                dataSources.push(files[i]);
                await createDataSource(path, options.overwrite || true, options.auth && options.auth[files[i].name] || {}, files[i].definition);
            } else {
                await reportService.createReport(files[i].name, path, options.overwrite || true, new Buffer(files[i].definition).toString('base64'), null, false);
            }
        } catch (error) { warrnings.push(error) }
    }

    // If shared datasources where created => fix references
    if (dataSources.length && !options.fixDataSourceReference) {
        var references = {};
        for (var i = 0; i < dataSources.length; i++) {
            var path = newPath(dataSources[i].path, reportPath);
            references[path.substr(path.lastIndexOf('/') + 1)] = path;
        }
        for (var i = 0; i < files.length; i++) {
            try {
                if (files[i].type === 'Report')
                    await fixDataSourceReference(newPath(files[i].path, reportPath), references);
            } catch (error) { warrnings.push(error) }
        }
    }
    return warrnings;
}

function newPath(path, newPath, removeName) {
    var parts = path.split('/');
    if (parts[0] === "" || parts[0] === '.') { parts.shift() }
    if (newPath) { parts[0] = newPath }
    if (removeName) { parts.pop(); }
    return '/' + parts.join('/');
}

async function createDataSource(path, overwrite, auth, rdsFile) {
    var name = getAttribute('Name', rdsFile);
    var extension = extractBetween('Extension', rdsFile);
    if (!auth.connectString) {
        auth.connectString = extractBetween('ConnectString', rdsFile);
    }
    var security = !!extractBetween('IntegratedSecurity', rdsFile);
    var prompt = extractBetween('Prompt', rdsFile);
    var promptSpecified = !!prompt;

    var dataSourceDefinition = {
        ConnectString: connectString,
        Extension: extension,
        Enabled: true,
        EnabledSpecified: true,
        ImpersonateUserSpecified: false,
    };
    // Override security if supplied username
    if (auth.username) {
        dataSourceDefinition.CredentialRetrieval = 'Store';
        dataSourceDefinition.UserName = auth.username;
        dataSourceDefinition.Password = auth.password;
        dataSourceDefinition.WindowsCredentials = true;
    } else {
        if (promptSpecified) {
            dataSourceDefinition.CredentialRetrieval = 'Prompt';
            dataSourceDefinition.Prompt = prompt;
        } else {
            dataSourceDefinition.CredentialRetrieval = 'Integrated';
            dataSourceDefinition.Prompt = null;
        }
        dataSourceDefinition.WindowsCredentials = false;
    }

    await reportService.createDataSource(name, path, overwrite, dataSourceDefinition);
}

async function fixDataSourceReference(path, rds) {
    var dataSources = await reportService.getItemDataSources(path);
    // If datasources are found
    if (dataSources.length) {
        var ds = {};
        for (var i = 0; i < dataSources.length; i++) {
            ds[dataSources[i].Name] = rds[dataSources[i].Name];
        }
        await reportService.setItemDataSources(path, ds);
    }
}

function extractBetween(tag, str) {
    var match = new RegExp('<' + tag + '>(.*?)<\/' + tag + '>').exec(str);
    return match && match[1];
}
function getAttribute(attr, str) {
    var match = new RegExp(attr + '="([^"]*)"').exec(str);
    return match && match[1];
}