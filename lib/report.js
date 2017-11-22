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
    fixDataSourceReference: fixDataSourceReference,
    errorHandler: errorHandler
}

const fs = require('fs');
const moment = require('moment');
const soap = require('./soap');
const reportService = require('./reportService');
const reportExecution = require('./reportExecution');

var isCacheable = true;
var cache = {};

function errorHandler(err) {
    var message = err && err.root && err.root.Envelope && err.root.Envelope.Body && err.root.Envelope.Body.Fault.faultstring || err.message;
    throw new Error(message);
}

async function startServices(urlOrServerConfig, auth, options, security) {
    options = options || {};
    soap.setRootFolder(options.rootFolder);
    var url = soap.setServerUrl(urlOrServerConfig);
    await reportService.start(url, auth, security, options.useRs2012);
    await reportExecution.start(url, auth, security);
    if (options.cache === false) { isCacheable = options.cache }
    if (isCacheable) { await cacheReportList() }
}

function clearCache() {
    for (var key in cache) { delete cache[key] }
}

async function getReportList(reportPath, forceRefresh) {
    if (isCacheable) {
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

    cache[reportPath] = [];
    if (!reports) { return }

    for (var i = 0; i < reports.length; i++) {
        if (reports[i].TypeName === "DataSource") { continue; }
        if (reports[i].TypeName === "Folder") {
            reportPath = reports[i].Path.substr(reports[i].Path.lastIndexOf("/"));
            cache[reportPath] = [];
        } else if (reports[i].TypeName === "ReportItem" || reports[i].TypeName === "Report") {
            if (keepHidden) {
                cache[reportPath].push(reports[i]);
            } else {
                // eliminate hidden reports
                var properties = await reportService.getProperties(reports[i].Path, [{ Name: 'Hidden' }])
                if (properties && properties[0].Value === "False") {
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

    if (isCacheable) {
        clearCache();
        cacheReportList();
    }

    return newReport;
}

async function download(reportPath) {
    if (!Array.isArray(reportPath)) reportPath = [reportPath];
    var files = [];
    while (reportPath.length) {
        var result = await reportService.listChildren(reportPath.shift(), true);
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
    var path = targetPath || sourcePath.substring(sourcePath.lastIndexOf('/'))
    var files = read('./' + path, sourcePath, []);
    return await upload(path, options, files);
}

function read(path, sourcePath, files) {
    var dir = fs.readdirSync(sourcePath);
    for (var i = 0; i < dir.length; i++) {
        var p = path + '/' + dir[i];
        var sp = sourcePath + '/' + dir[i]
        if (fs.statSync(sp).isDirectory()) {
            files.push({ name: dir[i], path: p, type: 'Folder' });
            read(p, sp, files);
        } else {
            var content = fs.readFileSync(sp).toString();
            var type = dir[i].substring(dir[i].lastIndexOf('.')) == '.rds' ? 'DataSource' : 'Report';
            var name = dir[i].substring(0, dir[i].lastIndexOf('.'))
            files.push({ name: name, path: p, type: type, definition: content });
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
    } catch (error) {
        if (options.debug) console.log(error.message);
        warrnings.push(error);
    }

    if (options.deleteReports) {
        // Iterate through each report in the target folder deleting them
        var reports = await reportService.listChildren(reportPath, true);
        for (var i = 0; i < reports.length; i++) {
            if (reports[i].Type === 'Report') {
                try {
                    reportService.deleteItem(reports[i].Path);
                } catch (error) {
                    if (options.debug) console.log(error.message);
                    warrnings.push(error);
                }
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
                await createDataSource(path, options.overwrite || true, options.auth && options.auth[files[i].name] || {}, files[i].definition, files[i].name);
            } else {
                await reportService.createReport(files[i].name, path, options.overwrite || true, new Buffer(files[i].definition).toString('base64'), null, false);
            }
        } catch (error) {
            if (options.debug) console.log(files[i].name, '--->', error.message);
            warrnings.push(error);
        }
    }

    // If shared datasources where created => fix references
    if (dataSources.length && !options.fixDataSourceReference) {
        var references = {};
        for (var i = 0; i < dataSources.length; i++) {
            var path = newPath(dataSources[i].path, reportPath).replace(/\.rds$/i, '');
            var name = path.substr(path.lastIndexOf('/') + 1).replace(/\.rds$/i, '');
            references[name] = path;
        }
        files = files.filter(r => r.type === 'Report');
        var res = await setReferences(files, references, options.debug);
        warrnings.concat(res);
    }
    return warrnings;
}

function newPath(path, newPath, removeName) {
    var parts = path.split('/');
    if (parts[0] === "" || parts[0] === '.') { parts.shift() }
    if (!parts.length) { return '/' + (newPath || '') }
    if (newPath) { parts[0] = newPath }
    if (removeName) { parts.pop(); }
    return '/' + parts.join('/');
}

async function createDataSource(path, overwrite, auth, rdsFile, rdsName) {
    var name = getAttribute('Name', rdsFile) || rdsName;
    var extension = extractBetween('Extension', rdsFile);
    if (!auth.connectstring) {
        auth.connectstring = extractBetween('ConnectString', rdsFile);
    }
    var security = !!extractBetween('IntegratedSecurity', rdsFile);
    var prompt = extractBetween('Prompt', rdsFile);
    var promptSpecified = !!prompt;

    var dataSourceDefinition = {
        ConnectString: auth.connectstring,
        Extension: extension,
        Enabled: true,
        EnabledSpecified: true,
        ImpersonateUserSpecified: false,
    };
    if (auth.windowsCredentials) {
        dataSourceDefinition.WindowsCredentials = false;
    }
    // Override security if supplied username
    if (auth.userName) {
        dataSourceDefinition.CredentialRetrieval = 'Store';
        dataSourceDefinition.UserName = auth.userName;
        dataSourceDefinition.Password = auth.password;
    } else {
        if (promptSpecified) {
            dataSourceDefinition.CredentialRetrieval = 'Prompt';
            dataSourceDefinition.Prompt = prompt;
        } else {
            dataSourceDefinition.CredentialRetrieval = 'Integrated';
            dataSourceDefinition.Prompt = null;
        }
    }

    await reportService.createDataSource(name, path, overwrite, dataSourceDefinition);
}

async function fixDataSourceReference(reportPath, dataSourcePath) {
    var reports = await reportService.listChildren(reportPath, true);
    var dataSources = await reportService.listChildren(dataSourcePath, true);
    var files = reports.filter(r => r.Type === 'Report');
    var ds = reports.filter(r => r.Type === 'DataSource').map(r => {
        var res = {};
        res[r.Name] = r.Path;
        return res
    });
    var result = await setReferences(files, ds, true);
    return result;
}

async function setReferences(files, dataSources, silent) {
    var warrnings = [];
    for (var i = 0; i < files.length; i++) {
        try {
            await setDataSourceReference(newPath(files[i].Path || files[i].path).replace(/\.rdl$/i, ''), dataSources);
        } catch (error) {
            if (!silent) console.log(error.message);
            warrnings.push(error)
        }
    }
    return warrnings;
}

async function setDataSourceReference(path, rds) {
    var dataSources = await reportService.getItemReferences(path, 'DataSource');
    // If datasources are found
    if (dataSources.length) {
        var refs = [];
        for (var i = 0; i < dataSources.length; i++)
            if (dataSources[i].Name in rds)
                refs.push({ Name: dataSources[i].Name, Reference: rds[dataSources[i].Name].replace(/\.rds$/i, '') });
        if (refs.length)
            await reportService.setItemReferences(path, refs);
    }
}

async function setDataSource(path, rds) {
    var dataSources = await reportService.getItemReferences(path, 'DataSource');
    // If datasources are found
    if (dataSources.length) {
        var refs = [];
        for (var i = 0; i < dataSources.length; i++)
            if (dataSources[i].Name in rds)
                refs.push({ Name: dataSources[i].Name, DataSourceReference: { Reference: rds[dataSources[i].Name].replace(/\.rds$/i, '') } });
        if (refs.length)
            await reportService.setItemDataSources(path, refs);
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