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
    readFiles: readFiles,
    fixDataSourceReference: fixDataSourceReference,
    errorHandler: errorHandler
}

const fs = require('fs');
const dayjs = require('dayjs');

const soap = require('./soap');
const reportService = require('./reportService');
const reportExecution = require('./reportExecution');

var isCacheable = true;
var cache;

function errorHandler(err) {
    var message = err && err.root && err.root.Envelope && err.root.Envelope.Body && err.root.Envelope.Body.Fault.faultstring;
    throw new Error(message || err && err.message || err);
}

async function startServices(urlOrServerConfig, config, options, security) {
    options = options || {};
    soap.setRootFolder(options.rootFolder);
    var url = soap.setServerUrl(urlOrServerConfig);

    if (!options.hasOwnProperty('skipSetServerUrl')) { options.skipSetServerUrl = true; }
    await reportService.start(url, config, options, security);
    await reportExecution.start(url, config, options, security);

    if (options.cache === false) { isCacheable = options.cache }
    if (isCacheable) { await cacheReportList() }
}

function clearCache() {
    for (var key in cache) { delete cache[key] }
}

async function getReportList(reportPath, forceRefresh) {
    if (isCacheable) {
        if (!cache) { await cacheReportList(reportPath) }
        if ((!reportPath || reportPath === soap.getRootFolder()) && !forceRefresh) {
            return cache
        } else if (reportPath in cache && !forceRefresh) {
            return cache[reportPath]
        } else {
            await cacheReportList(reportPath);
            return cache[reportPath];
        }
    } else {
        return await reportService.listChildren(reportPath)
    }
}

async function cacheReportList(reportPath, keepHidden) {
    reportPath = (reportPath || soap.getRootFolder());
    var reports = await reportService.listChildren(reportPath, true);

    if (!cache) cache = {};
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
        reportName = reportName.substring(0, reportName.lastIndexOf("_") + 1) + dayjs().format("DDMMYYTHHmm");
    } else {
        reportName = reportName + "_custom_" + dayjs().format("DDMMYYTHHmm");
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
    var files = { folders: [], dataSources: [], reports: [], others: [] };
    while (reportPath.length) {
        var result = await reportService.listChildren(reportPath.shift(), true);
        for (var i = 0; i < result.length; i++) {
            var file = { name: result[i].Name, path: result[i].Path };
            if (result[i].TypeName !== 'Folder') {
                file.definition = await reportService.getItemDefinition(result[i].Path);
            }
            var placement = 'others';
            if (result[i].TypeName === 'Folder') { placement = 'folders' }
            else if (result[i].TypeName === 'Report') { placement = 'reports' }
            else if (result[i].TypeName === 'DataSource') { placement = 'dataSources' }
            files[placement].push(file);
        }
    }
    return files;
}

async function readFiles(filePath, exclude, noDefinitions) {
    var init = { folders: [], reports: [], dataSources: [], other: [] };
    return read(filePath, '', init, exclude || [], noDefinitions);
}

function read(root, relativePath, files, exclude, noDefinitions) {
    var dir = fs.readdirSync(root + relativePath);
    for (var i = 0; i < dir.length; i++) {
        var path = relativePath + '/' + dir[i];
        if (exclude.indexOf(dir[i]) > -1) { continue }
        if (fs.statSync(root + path).isDirectory()) {
            if (exclude.indexOf(path) > -1) { continue; }
            files.folders.push({ name: dir[i], path: path });
            read(root, path, files, exclude, noDefinitions);
        } else {
            var idx = dir[i].lastIndexOf('.');
            var ext = dir[i].substring(idx);
            if (exclude.indexOf(ext) > -1) { continue }
            var options = { name: dir[i].substring(0, idx), path: path };

            if (!noDefinitions) {
                var content = fs.readFileSync(root + path).toString();
                options.definition = content;
            } else {
                options.filePath = root;
            }

            var placement = 'other';
            if (ext === '.rds') { placement = 'dataSources' }
            else if (ext === '.rdl') { placement = 'reports' }
            files[placement].push(options);
        }
    }
    return files;
}

async function uploadFiles(filePath, reportPath, options) {
    var files = await readFiles(filePath, options && options.exclude);
    if (options) {
        var inc = options.include || {};
        if (Array.isArray(inc.folders)) { files.folders = files.folders.concat(inc.folders) }
        if (Array.isArray(inc.dataSources)) { files.dataSources = files.dataSources.concat(inc.dataSources) }
        if (Array.isArray(inc.reports)) { files.reports = files.reports.concat(inc.reports) }
        delete options.include;
    }
    return await upload(reportPath, files, options);
}

async function upload(reportPath, files, options) {
    var warrnings = [], options = options || {};

    function logger(msg, type) {
        if (!options.logger) return;
        if (options.logger === true) console[type](msg);
        else if (options.logger[type]) options.logger[type](msg);
    }
    function log(msg, type) { logger(msg, 'log') }
    log.warn = function warn(msg) { logger(msg, 'warn') }

    try {
        log('Check report folder...');
        await reportService.listChildren(reportPath);
    } catch (error) {
        try {
            log("Create root folder '" + reportPath + "'.");
            var parts = reportPath.split('/');
            var result = await reportService.createFolder(parts.pop(), '/' + parts.join('/'));
        } catch (error) {
            log.warn(error.message);
            warrnings.push(error);
        }
    }

    if (options.deleteExistingItems) {
        log('Delete existing items' + (options.keepDataSource ? ', keep DataSources' : '') + ' ...');
        var items = await reportService.listChildren(reportPath, true);
        items = items || [];

        for (var i = 0; i < items.length; i++) {
            try {
                if (options.keepDataSource && items[i].TypeName == 'DataSource') { continue }
                await reportService.deleteItem(items[i].Path);
            } catch (error) {
                log.warn(error.message);
                warrnings.push(error);
            }
        }
    }

    reportPath = /^\//.test(reportPath) ? reportPath.substr(1) : reportPath;
    var count = 1;
    var total = 1
        + (files.folders && files.folders.length || 0)
        + (files.dataSources && files.dataSources.length || 0)
        + (files.reports && files.reports.length || 0);

    if (files.folders && files.folders.length > 0) {
        for (var i = 0; i < files.folders.length; i++) {
            try {
                var path = newPath(files.folders[i].path, reportPath, true);
                log('[' + (++count) + '/' + total + '] Create folder: ' + path + '/' + files.folders[i].name);
                await reportService.createFolder(files.folders[i].name, path);
            } catch (error) {
                log.warn(error.message);
                warrnings.push(error);
            }
        }
    }

    if (files.dataSources && files.dataSources.length > 0) {
        for (var i = 0; i < files.dataSources.length; i++) {
            try {
                if (!files.dataSources[i].definition) {
                    files.dataSources[i].definition = fs.readFileSync(files.reports[i].filePath + files.reports[i].path).toString();
                }
                var path = newPath(files.dataSources[i].path, reportPath, true);
                log('[' + (++count) + '/' + total + '] Create datasource: ' + path + '/' + files.dataSources[i].name);
                await createDataSource(path,
                    files.dataSources[i].overwrite || options.overwrite,
                    options.dataSourceOptions && options.dataSourceOptions[files.dataSources[i].name] || {},
                    files.dataSources[i].definition,
                    files.dataSources[i].name);
            } catch (error) {
                log.warn(error.message);
                warrnings.push(error);
            }
        }
    } else if (options.dataSourceOptions) {
        for (var key in options.dataSourceOptions) {
            log('Create additional datasource: /' + reportPath + '/' + key);
            await reportService.createDataSource(key, '/' + reportPath, true, options.dataSourceOptions[key]);
        }
    }

    if (files.reports && files.reports.length > 0) {
        for (var i = 0; i < files.reports.length; i++) {
            try {
                if (!files.reports[i].definition) {
                    files.reports[i].definition = fs.readFileSync(files.reports[i].filePath + files.reports[i].path).toString();
                }
                var path = newPath(files.reports[i].path, reportPath, true);
                log('[' + (++count) + '/' + total + '] Create report: ' + path + '/' + files.reports[i].name);
                await reportService.createReport(files.reports[i].name, path,
                    files.reports[i].overwrite || options.overwrite,
                    files.reports[i].definition);
            } catch (error) {
                log.warn(error.message);
                warrnings.push(error);
            }
        }
    }

    // If shared datasources where created => fix references if necessary
    if (options.fixDataSourceReference && (files.dataSources.length > 0 || options.dataSourceOptions)) {
        var references = {};
        log('Set datasource references...');
        if (files.dataSources.length > 0) {
            for (var i = 0; i < files.dataSources.length; i++) {
                var path = newPath(files.dataSources[i].path, reportPath).replace(/\.rds$/i, '');
                var name = files.dataSources[i].name || path.substr(path.lastIndexOf('/') + 1).replace(/\.rds$/i, '');
                references[name] = path;
            }
        }
        if (options.dataSourceOptions) {
            for (var key in options.dataSourceOptions) {
                var path = newPath(options.dataSources[key].path, reportPath).replace(/\.rds$/i, '');
                references[key] = path;
            }
        }
        var warn = await setReferences(files.reports, references, '/' + reportPath, log);
        warrnings.concat(warn);
    }

    return warrnings;
}

function newPath(path, newPath, removeName) {
    var parts = path.split('/');
    if (parts[0] === "" || parts[0] === '.') { parts.shift() }
    if (!parts.length) { return '/' + (newPath || '') }
    if (newPath) { parts.unshift(newPath) }
    if (removeName) { parts.pop(); }
    return '/' + parts.join('/');
}

async function createDataSource(path, overwrite, auth, rdsFile, rdsName) {
    var name = rdsFile.Name || getAttribute('Name', rdsFile) || rdsName;
    var extension = rdsFile.Extension || extractBetween('Extension', rdsFile);
    if (!auth.ConnectString) {
        auth.ConnectString = extractBetween('ConnectString', rdsFile);
    }
    var security = !!(rdsFile.IntegratedSecurity || extractBetween('IntegratedSecurity', rdsFile));
    var prompt = rdsFile.Prompt || extractBetween('Prompt', rdsFile);
    var promptSpecified = !!prompt;

    var dataSourceDefinition = {
        ConnectString: auth.ConnectString || rdsFile.ConnectString,
        Extension: extension,
        Enabled: true,
        EnabledSpecified: true,
        ImpersonateUserSpecified: rdsFile.ImpersonateUserSpecified || false,
    };
    if (auth.WindowsCredentials || rdsFile.WindowsCredentials) {
        dataSourceDefinition.WindowsCredentials = true;
    }
    // Override security if supplied username
    if (rdsFile.UserName || auth.UserName) {
        dataSourceDefinition.CredentialRetrieval = 'Store';
        dataSourceDefinition.UserName = auth.UserName || rdsFile.UserName;
        dataSourceDefinition.Password = auth.Password || rdsFile.Password;
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

async function fixDataSourceReference(reportPath, dataSourcePath, logger) {
    var items = await reportService.listChildren(reportPath, true);
    var reports = items.filter(r => r.TypeName === 'Report');

    var dataSources;
    if (dataSourcePath && dataSourcePath != reportPath) {
        dataSources = await reportService.listChildren(dataSourcePath, true);
    } else {
        dataSources = items.filter(r => r.TypeName === 'DataSource')
    }

    function doLog(msg, type) {
        if (logger === true) console[type](msg);
        else if (logger && logger[type]) logger[type](msg);
    }
    function log(msg) { doLog(msg, 'log') }
    log.warn = function warn(msg) { doLog(msg, 'warn') }

    if (!dataSources.length) {
        log.warn('No dataSources found!');
        return [];
    }

    var ds = {};
    dataSources.forEach(r => { ds[r.Name] = r.Path });

    var result = await setReferences(reports, ds, '', log);
    return result;
}

async function setReferences(reports, dataSources, reportPath, log) {
    var warrnings = [], path;
    for (var i = 0; i < reports.length; i++) {
        try {
            path = reportPath + (reports[i].Path || reports[i].path).replace(/\.rdl$/i, '');
            log && log("[" + (i + 1) + "/" + (reports.length + 1) + "] Set '" + path + "' datasource references.");
            var result = await setDataSourceReference(path, dataSources);
            if (result) log(result)
        } catch (error) {
            log && log.warn(error.message);
            warrnings.push(error);
        }
    }
    return warrnings;
}

async function setDataSourceReference(path, rds) {
    var dataSources = await reportService.getItemReferences(path, 'DataSource');
    if (dataSources.length) {
        var refs = [];
        for (var i = 0; i < dataSources.length; i++)
            if (dataSources[i].Name in rds)
                refs.push({ Name: dataSources[i].Name, Reference: rds[dataSources[i].Name].replace(/\.rds$/i, '') });
        if (refs.length) {
            await reportService.setItemReferences(path, refs);
        } else {
            return 'No compatible datasources found for ' + path;
        }
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