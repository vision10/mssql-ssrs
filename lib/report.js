
const fs = require('fs');
const dayjs = require('dayjs');

const ReportService = require('./reportService');
const ReportExecution = require('./reportExecution');

module.exports = class ReportManager {
    constructor(cacheReports) {
        this.cache = {};
        this.isCacheable = cacheReports || false;
        this.reportService = new ReportService();
        this.reportExecution = new ReportExecution();
    }

    async start(urlOrServerConfig, clientConfig, options, security) {
        await this.reportService.start(urlOrServerConfig, clientConfig, options, security);
        await this.reportExecution.start(urlOrServerConfig, clientConfig, options, security);
        if (options) {
            if (options.cache) { this.isCacheable = options.cache }
            if (this.isCacheable && options.cacheOnStart) { await this.cacheReportList() }
        }
    }

    reportBuilder(reportPath) {
        const rs = this.reportService.soapInstance || this.reportExecution.soapInstance;
        return `${rs.getServerUrl()}/ReportBuilder/ReportBuilder_3_0_0_0.application?ReportPath=${reportPath || '/'}`
    }

    clearCache() {
        for (var key in this.cache) { delete this.cache[key] }
    }

    async getReportList(reportPath, forceRefresh) {
        if (this.isCacheable) {
            if (!(reportPath in this.cache) || forceRefresh) {
                await this.cacheReportList(reportPath)
            }
            return this.cache[reportPath]
        } else {
            return await this.reportService.listChildren(reportPath)
        }
    }

    async cacheReportList(reportPath, keepHidden) {
        reportPath = (reportPath || (this.reportService.soapInstance || this.reportExecution.soapInstance).getRootFolder());
        const reports = await this.reportService.listChildren(reportPath, true);
        if (!reports.length) { return }
        this.cache[reportPath] = [];

        for (var i = 0; i < reports.length; i++) {
            if (reports[i].TypeName === "DataSource") { continue; }
            if (reports[i].TypeName === "Folder") {
                reportPath = reports[i].Path.substr(reports[i].Path.lastIndexOf("/"));
                this.cache[reportPath] = [];
            } else if (reports[i].TypeName === "ReportItem" || reports[i].TypeName === "Report") {
                if (keepHidden) {
                    this.cache[reportPath].push(reports[i]);
                } else {
                    // eliminate hidden reports
                    var properties = await this.reportService.getProperties(reports[i].Path, [{ Name: 'Hidden' }])
                    if (properties && properties[0].Value === "False") {
                        this.cache[reportPath].push(reports[i]);
                    }
                }
            }
        }
    }

    async createReportCopy(reportPath, options) {
        var reportName = reportPath.substr(reportPath.lastIndexOf("/") + 1);
        const reportFolder = reportPath.substr(0, reportPath.lastIndexOf("/"));

        if (reportName.indexOf("_custom_") != -1) {
            reportName = reportName.substring(0, reportName.lastIndexOf("_") + 1) + dayjs().format("DDMMYYTHHmm")
        } else {
            reportName = reportName + "_custom_" + dayjs().format("DDMMYYTHHmm")
        }

        const definition = await this.reportService.getItemDefinition(reportPath);
        const newReport = await this.reportService.createReport(
            options.name || reportName,
            options.parent || reportFolder,
            options.overwrite || false,
            definition,
            options.description,
            options.hidden
        );

        if (isCacheable) {
            this.clearCache();
            this.cacheReportList();
        }

        return newReport;
    }

    async download(reportPath) {
        if (!Array.isArray(reportPath)) reportPath = [reportPath];
        var files = { folders: [], dataSources: [], reports: [], others: [] };
        while (reportPath.length) {
            const result = await this.reportService.listChildren(reportPath.shift(), true);
            for (var i = 0; i < result.length; i++) {
                var file = { name: result[i].Name, path: result[i].Path };
                if (result[i].TypeName !== 'Folder') {
                    file.definition = await this.reportService.getItemDefinition(result[i].Path)
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

    async readFiles(filePath, exclude, noDefinitions) {
        const init = { folders: [], reports: [], dataSources: [], other: [] };
        return this.read(filePath, '', init, exclude || [], noDefinitions);
    }

    read(root, relativePath, files, exclude, noDefinitions) {
        var dir = fs.readdirSync(root + relativePath);
        for (var i = 0; i < dir.length; i++) {
            var path = relativePath + '/' + dir[i];
            if (exclude.indexOf(dir[i]) > -1) { continue }
            if (fs.statSync(root + path).isDirectory()) {
                if (exclude.indexOf(path) > -1) { continue; }
                files.folders.push({ name: dir[i], path: path });
                this.read(root, path, files, exclude, noDefinitions);
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

    async uploadFiles(filePath, reportPath, options) {
        var files = await this.readFiles(filePath, options && options.exclude);
        if (options) {
            var inc = options.include || {};
            if (Array.isArray(inc.folders)) { files.folders = files.folders.concat(inc.folders) }
            if (Array.isArray(inc.dataSources)) { files.dataSources = files.dataSources.concat(inc.dataSources) }
            if (Array.isArray(inc.reports)) { files.reports = files.reports.concat(inc.reports) }
            delete options.include;
        }
        return await this.upload(reportPath, files, options);
    }

    async upload(reportPath, files, options) {
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
            await this.reportService.listChildren(reportPath);
        } catch (error) {
            try {
                log("Create root folder '" + reportPath + "'.");
                var parts = reportPath.split('/');
                var result = await this.reportService.createFolder(parts.pop(), '/' + parts.join('/'));
            } catch (error) {
                log.warn(error.message);
                warrnings.push(error);
            }
        }

        if (options.deleteExistingItems) {
            log('Delete existing items' + (options.keepDataSource ? ', keep DataSources' : '') + ' ...');
            var items = await this.reportService.listChildren(reportPath, true);
            items = items || [];

            for (var i = 0; i < items.length; i++) {
                try {
                    if (options.keepDataSource && items[i].TypeName == 'DataSource') { continue }
                    await this.reportService.deleteItem(items[i].Path);
                } catch (error) {
                    log.warn(error.message);
                    warrnings.push(error);
                }
            }
        }

        reportPath = /^\//.test(reportPath) ? reportPath.substr(1) : reportPath;
        var count = 0;
        var total = 1
            + (files.folders && files.folders.length || 0)
            + (files.dataSources && files.dataSources.length || 0)
            + (files.reports && files.reports.length || 0);

        if (files.folders && files.folders.length > 0) {
            for (var i = 0; i < files.folders.length; i++) {
                try {
                    var path = this.newPath(files.folders[i].path, reportPath, true);
                    log(`[${(++count)}/${total}] Create folder: ${path}/${files.folders[i].name}`);
                    await this.reportService.createFolder(files.folders[i].name, path);
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
                    var path = this.newPath(files.dataSources[i].path, reportPath, true);
                    log(`[${(++count)}/${total}] Create datasource: ${path}/${files.dataSources[i].name}`);
                    await this.createDataSource(path,
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
                log(`Create additional datasource: /${reportPath}/${key}`);
                await this.reportService.createDataSource(key, '/' + reportPath, true, options.dataSourceOptions[key]);
            }
        }

        if (files.reports && files.reports.length > 0) {
            for (var i = 0; i < files.reports.length; i++) {
                try {
                    if (!files.reports[i].definition) {
                        files.reports[i].definition = fs.readFileSync(files.reports[i].filePath + files.reports[i].path).toString();
                    }
                    var path = this.newPath(files.reports[i].path, reportPath, true);
                    log(`[${(++count)}/${total}] Create report: ${path}/${files.reports[i].name}`);
                    await this.reportService.createReport(files.reports[i].name, path,
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
                    var path = this.newPath(files.dataSources[i].path, reportPath).replace(/\.rds$/i, '');
                    var name = files.dataSources[i].name || path.substr(path.lastIndexOf('/') + 1).replace(/\.rds$/i, '');
                    references[name] = path;
                }
            }
            if (options.dataSourceOptions) {
                for (var key in options.dataSourceOptions) {
                    var path = this.newPath(options.dataSources[key].path, reportPath).replace(/\.rds$/i, '');
                    references[key] = path;
                }
            }
            var warn = await this.setReferences(files.reports, references, '/' + reportPath, log);
            warrnings.concat(warn);
        }

        return warrnings;
    }

    newPath(path, newPath, removeName) {
        var parts = path.split('/');
        if (parts[0] === "" || parts[0] === '.') { parts.shift() }
        if (!parts.length) { return '/' + (newPath || '') }
        if (newPath) { parts.unshift(newPath) }
        if (removeName) { parts.pop(); }
        return '/' + parts.join('/');
    }

    async createDataSource(path, overwrite, auth, rdsFile, rdsName) {
        var name = rdsFile.Name || this.getAttribute('Name', rdsFile) || rdsName;
        var extension = rdsFile.Extension || this.extractBetween('Extension', rdsFile);
        if (!auth.ConnectString) {
            auth.ConnectString = this.extractBetween('ConnectString', rdsFile);
        }
        var security = !!(rdsFile.IntegratedSecurity || this.extractBetween('IntegratedSecurity', rdsFile));
        var prompt = rdsFile.Prompt || this.extractBetween('Prompt', rdsFile);
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

        await this.reportService.createDataSource(name, path, overwrite, dataSourceDefinition);
    }

    async fixDataSourceReference(reportPath, dataSourcePath, logger) {
        var items = await this.reportService.listChildren(reportPath, true);
        var reports = items.filter(r => r.TypeName === 'Report');

        var dataSources;
        if (dataSourcePath && dataSourcePath != reportPath) {
            dataSources = await this.reportService.listChildren(dataSourcePath, true);
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

        var result = await this.setReferences(reports, ds, '', log);
        return result;
    }

    async setReferences(reports, dataSources, reportPath, log) {
        var warrnings = [], path;
        for (var i = 0; i < reports.length; i++) {
            try {
                path = reportPath + (reports[i].Path || reports[i].path).replace(/\.rdl$/i, '');
                log && log("[" + (i + 1) + "/" + (reports.length + 1) + "] Set '" + path + "' datasource references.");
                var result = await this.setDataSourceReference(path, dataSources);
                if (result) log(result)
            } catch (error) {
                log && log.warn(error.message);
                warrnings.push(error);
            }
        }
        return warrnings;
    }

    async setDataSourceReference(path, rds) {
        var dataSources = await this.reportService.getItemReferences(path, 'DataSource');
        if (dataSources.length) {
            var refs = [];
            for (var i = 0; i < dataSources.length; i++)
                if (dataSources[i].Name in rds)
                    refs.push({ Name: dataSources[i].Name, Reference: rds[dataSources[i].Name].replace(/\.rds$/i, '') });
            if (refs.length) {
                await this.reportService.setItemReferences(path, refs);
            } else {
                return 'No compatible datasources found for ' + path;
            }
        }
    }

    async setDataSource(path, rds) {
        var dataSources = await this.reportService.getItemReferences(path, 'DataSource');
        // If datasources are found
        if (dataSources.length) {
            var refs = [];
            for (var i = 0; i < dataSources.length; i++)
                if (dataSources[i].Name in rds) {
                    const dsRef = { Reference: rds[dataSources[i].Name].replace(/\.rds$/i, '') };
                    refs.push({ Name: dataSources[i].Name, DataSourceReference: dsRef });
                }
            if (refs.length) {
                await this.reportService.setItemDataSources(path, refs)
            }
        }
    }

    extractBetween(tag, str) {
        var match = new RegExp('<' + tag + '>(.*?)<\/' + tag + '>').exec(str);
        return match && match[1];
    }
    getAttribute(attr, str) {
        var match = new RegExp(attr + '="([^"]*)"').exec(str);
        return match && match[1];
    }
}