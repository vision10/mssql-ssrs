
# mssql-ssrs

> Promise based api for MSSQL reporting services

## Table of contents

- [Install](#install)
- [Usage](#Usage)
  - [Url/serverConfig/path](#url/serverConfig/path)  
  - [Soap config](#soap-config)  
  - [Report service options](#report-service-options)  
  - [Security](#security)  
- [Report Service](#Report-Service)
  - [report service client](#report-service-client)
  - [client description](#client-description)
  - [list children](#list-children)
  - [get parameters for specific report](#get-parameters-for-specific-report)
  - [update parameters for specifig report](#update-parameters-for-specifig-report)
  - [Testing data source connection](#testing-data-source-connection)
  - [get report properties](#get-report-properties)
  - [set report properties](#set-report-properties)
  - [list all running jobs](#list-all-running-jobs)
  - [cancel running job](#cancel-running-job)
  - [get item definition](#get-item-definition)
  - [create folder](#create-folder)
  - [create data source](#create-data-source)
  - [create report](#create-report)
  - [delete item](#delete-item)
  - [get item datasources](#get-item-data-sources)
  - [set item datasources](#set-item-data-sources)
  - [get item references](#get-item-references)
  - [set item references](#set-item-references)
  - [create resource](#create-resource)
- [Report Execution](#soap-headers)
  - [get report execution client](#get-report-execution-client)
  - [get client description](#get-client-description)
  - [list available rendering extensions](#list-available-rendering-extensions)
  - [run report](#run-report)
  - [run report by url](#run-report-by-url)
- [Soap](#client)
  - [create client](#create-client)
  - [security](#security)
- [Report, general](#Report,-general)
  - [get report list](#get-report-list)
  - [cache report list](#cache-report-list)
  - [create a copy of a report](#create-a-copy-of-a-report)
  - [create link for report builder for specified report ](#create-link-for-report-builder-for-specified-report)
  - [clear cached reports](#clear-cached-reports)
  - [read reports folder](#read-reports-folder)
  - [upload reports](#upload-reports)
  - [download reports](#download-reports)
  - [fix data source reference](#fix-data-source-reference)
- [Contributors](#contributors)


## Install

Install with [npm](http://github.com/isaacs/npm):

```
  npm install mssql-ssrs
```

## Usage

MSSQL has 2 parts for reporting services:
- report service for report management
- report execution for report rendering

```js
var ssrs = require('mssql-ssrs');

// start both services (reportService, reportExecution)
await ssrs.start(url/path/serverConfig, soapConfig [, options] [, security]);
```

or start them separately

```js
var rs = await ssrs.reportService.start(url/Path/serverConfig, soapConfig [, options] [, security]);
var re = await ssrs.reportExecution.start(url/Path/serverConfig, soapConfig [, options] [, security]);
```

#### Url/serverConfig/path

The `url/serverConfig/path` argument accepts a string url, config object or a system file path: 
```js
var url = 'http(s)://<serverName>:<port>/ReportServer_<sqlInstance>',
var serverConfig = {
    server: 'serverName',
    instance: 'serverInstance',
    isHttps: false, // optional
    port: '80', // optional
};
```

#### Soap Config

[soap config](https://www.npmjs.com/package/soap#options)
also includes directly on config or on config.wsdl_options
- `username`: required
- `password`: required
- `workstation`: optional
- `domain`: optional

#### Report Service Options

- `rootFolder`: base folder added to `reportPath` parameters, default '/'
- `cache`: specify whether to cache report list, by default hidden reports are not kept, default true 
- `useRs2012`: specify witch version of wsdl should client use (2010/2012), default uses 2010

#### Security

More information on types of security see [soap security](https://github.com/vpulim/node-soap#security)
Defaults to ntml

Ex for basic security
```js
    var config = { username: username, password: password };
    await ssrs.start(url, config, null, 'basic');
    // or
    var wsdl_headers = {};
    var security = new ssrs.soap.security.BasicAuthSecurity(config.username, config.password);
    security.addHeaders(wsdl_headers);
    //                      for initial client creation      to set security on client
    await ssrs.start(url, { wsdl_headers: wsdl_headers }, null, security);
```

## Report Service

### Report service client

```js
var client = await ssrs.reportService.getClient();
```

### Client description

```js
var clientDescription = await ssrs.reportService.getDescription();
```

### List children

List all children down from current specified folder, if recursive is used it will go down into all folders
```js
var reportList = await ssrs.reportService.listChildren(reportPath[, isRcursive]);
```

### Get parameters for specific report

```js
var params = await ssrs.reportService.getReportParams(reportPath[, forRendering]);
```

### Update parameters for specifig report

```js
var params = await ssrs.reportService.updateReportParams(reportPath, params[, formatParams]);
```

### Testing data source connection

For all DataSourceDefinition properties use [microsoft documentation](https://msdn.microsoft.com/en-us/library/reportservice2010.datasourcedefinition%28v=sql.120%29.aspx)

```js
var status = await ssrs.reportService.testDataSourceConnection(userName, password, dataSourceDefinition)
```

Example for `dataSourceDefinition`:

```js
DataSourceDefinition: {
  Extension: 'SQL',
  ConnectString: 'Data Source=<server>\\<instance>;Initial Catalog=<DbName>'
}
```

### Get report properties

If properties are given, all report properties are returned
```js
var properties = ['Hidden', 'Description'];
// or
var properties = [{ Name: 'Hidden' }, { Name: 'Description' }];
var properties = await ssrs.reportService.getProperties(reportPath[, properties])
```

### Set report properties

```js
var properties = { Hidden: true, Description: 'my description' };
// or
var properties = [{ Name: 'Hidden', Value: true }, { Name: 'Description', Value: 'my description' }];
var properties = await ssrs.reportService.setProperties(reportPath, properties)
```

### List all running jobs

```js
var jobs = await ssrs.reportService.listJobs()
```

### Cancel running job

```js
await ssrs.reportService.cancelJob(jobId)
```

### Get item definition

```js
var rdl = await ssrs.reportService.getItemDefinition(reportPath)
```

### Create folder

```js
await ssrs.reportService.createFolder(folderName, path)
```

### Create data source

```js
var dataSource = await ssrs.reportService.createDataSource(dataSourceName, folderPath, overwrite, definition, description, isHidden)
```
#### Create data source
- `dataSourceName`:  The name for the data source including the file name and, in SharePoint mode, the extension (.rsds).
- `folderPath`: The fully qualified URL for the parent folder that will contain the data source.
- `overwrite`: default false, indicates whether an existing data source with the same name in the location specified should be overwritten.
- `definition`: A `DataSourceDefinition` object that describes the connection properties for the data source.
- `description`: report description
- `isHidden`: hide report in ssrs

#### Data Source Definition
- `ConnectString`: 'data source=server\instance; initial catalog=databaseName'
- `UseOriginalConnectString`: data source should revert to the original connection string
- `OriginalConnectStringExpressionBased`: indicates whether the original connection string for the data source was expression-based.
- `Extension`: SQL, OLEDB, ODBC, or a custom 
- `Enabled`: enable/disable datasource
- `EnabledSpecified`: true if the `Enabled` property should be omitted from the Web service call; otherwise, false. The default is false.
- `CredentialRetrieval`: Prompt, Store, Integrated, None
- `WindowsCredentials`: indicates whether the report server passes user-provided or stored credentials as Windows credentials when it connects to a data source.
- `ImpersonateUser`: indicates whether the report server tries to impersonate a user by using stored credentials.
- `ImpersonateUserSpecified`: true if the `ImpersonateUser` property should be omitted from the Web service call; otherwise, false. The default is false.
- `Prompt`: prompt that the report server displays to the user when it prompts for credentials.    
- `UserName`: auth
- `Password`: auth    

### Create report

Mostly a above but definition is a `ReportDefinition` object
```js
var report = await ssrs.reportService.createReport(reportName, folderPath, overwrite, definition, description, isHidden)
```

### Delete item

```js
await ssrs.reportService.deleteItem(path)
```

### Create resource

Usually used for creating images

```js
var resurce = await ssrs.reportService.createResource(name, path, fileContents, overwrite, mimeType);
```

### Get item data sources

```js
var references = await ssrs.reportService.getItemDataSources(itemPath);
```

### Set item data sources

```js
var dataSources = { dataSourceName: 'dataSourcesNewReferencePath' });
var references = await ssrs.reportService.setItemDataSources(itemPath, dataSources);
```
- `itemPath`: path of the report including the file name
- `dataSources`: object of dataSourceName: newValue type.

### Get item references

```js
var references = await ssrs.reportService.getItemReferences(itemPath, referenceType);
```
- `itemPath`: path of the report including the file name
- `referenceType`: 'DataSource'|'DataSet'...

### Set item references

```js
var refs = { 'DataSourceName': '/path/DataSourceName' };
var refs = [{ Name: 'DataSourceName': Reference: '/path/DataSourceName' }];
var references = await ssrs.reportService.setItemReferences(itemPath, refs);
```
- `itemPath`: path of the report including the file name
- `refs`: array of objects with name and reference paths

## Report Execution
    
### Get report execution client

```js
var client = await ssrs.reportExecution.getClient()
```

### Get client description

```js
var clientDescription = await ssrs.reportExecution.getDescription()
```

### List available rendering extensions

```js
var extensions = await ssrs.reportExecution.listRenderingExtensions()
```

### Run report

```js
var reportPath = '/Folder/ReportName';
var fileType = 'word';
var parameters = { 
  parameterName: 'parameterValue', 
  parameterName2: false 
  multiValue: ['value1', 'value2']
};
//or
var parameters = [
  { Name: 'parameterName', Value: 'parameterValue' },
  { Name: 'parameterName2', Value: false }
  { Name: 'multiValue', Value: ['value1', 'value2'] }
]
var report = await ssrs.reportExecution.getReport(reportPath, fileType, parameters)
```
- `parameters` can be an object with name, value atributes or instance of `ReportParameterInfo` objects

### Run report by url

No need to use `start` auth is used for every request but `setServerUrl` is necessary

```js
// reportPath, fileType, parameters like getReport
// must provide authentication each time
var auth = {
  username: 'userName',
  password: 'password',
  workstation: '', // optional
  domain: '' // optional
};
var report = await ssrs.reportExecution.getReportByUrl(reportPath, fileType, parameters, auth)
```
- `parameters` can be an object with name, value atributes or instance of `ReportParameterInfo` objects

### Fix Data Source Reference

```js
var references = await ssrs.report.fixDataSourceReference(reportPath, dataSourcePath, logger);
```
- `reportPath`: path to reports
- `dataSourcePath`: path to data source

- `log`: boolean, outputs to console
or
- `log`: object
  - `log`: log messages function
  - `warn`: log warrning/error messages function


## soap 

### Create client

Creates [soap clients](https://github.com/vpulim/node-soap#soapcreateclienturl-options-callback---create-a-new-soap-client-from-a-wsdl-url-also-supports-a-local-filesystem-path)  (used for creating reportService and reportExecution client)

```js
var client = await ssrs.soap.createClient(url, auth[, security])
```

### Security

[soap security](https://www.npmjs.com/package/soap#security)

```js
var client = await ssrs.soap.security.BasicAuthSecurity('username', 'password')
```

## Report, general 

### Get report list

Get report list from cache, if path is not found in cache it will be download and cached

```js
var reportList = await ssrs.getReportList(reportPath, forceRefresh)
```

- if `reportPath` is not present of is the same as rootFolder for reports entire cache is returned
- `forceRefresh` force a recache, if `reportPath` is not present `rootFolder` is used

### Cache report list

```js
await ssrs.cacheReportList(reportPath, keepHidden)
```

### Clear cached reports

```js
await ssrs.clearCache()
```

### Create report builder link for specified report

[Report Builder](https://docs.microsoft.com/en-us/sql/reporting-services/install-windows/install-report-builder) only installs from ie/edge

```js
var link = await ssrs.reportBuilder(reportPath)
```

### Create a copy of a report 

Create a copy of a specified report in the same folder and return new report

```js
var newReport = await ssrs.createReportCopy(reportPath, options)
```

Inspired from [Report Loader](http://neilsleightholm.blogspot.ro/2008/08/report-loader-for-sql-server-reporting.html)

### Download reports

Download list of all items down from specified path, can also be used for 1 specific report

```js
var fileList = await ssrs.download(reportPath)
```

- `reportPath`: string|Array of strings path for base folders in report service from where to create definitions.

### Read reports folder

```js
var result = await ssrs.readFiles(filePath, exclude, noDefinitions);
```
- `filePath`: path to folder to read
- `exclude`: array of strings to exclude specified files paths, names or extensions
- `noDefinitions`: does not read file content(definition)

### Upload reports

Upload items (report/datasource/image) or entire folder structure to reporting services 

```js
var warrnings = await ssrs.upload(filePath, reportPath, options)
```
- `filePath`: root folder path where to read files
- `reportPath`: report path where to upload files
- `options` for `upload` and `uploadFiles` are the same

### Upload reports files

Read file directory and upload reports

```js
var warrnings = await ssrs.uploadFiles(filePath [, reportPath] [, options]);

var warrnings = await ssrs.uploadFiles('.path/to/root/directory', '/newReportFolderName', {
  deleteExistingItems: false,
  overwrite: false,
  exclude: ['folderName', '.extension', '/path/to/file.rdl'],
  fixDataSourceReference: false,
  dataSourceFirst: false,
  dataSourceOptions: {
    myDataSourceName: {
      ConnectString: 'data source=<server>\<instance>; initial catalog=<dbName>',
      UserName: '',
      Password: ''
    },
    mySecondDataSourceName: {
      WindowsCredentials: true,
      ConnectString: 'data source=<server>\<instance>; initial catalog=<dbName>',
      UserName: '',
      Password: ''
    }
  },
  logger: true || {
    log: function (msg) { console.log(msg) },
    warn: function (msg) { console.warn(msg) }
  }
}});

```
- `filePath`: root folder from where to read files
- `reportPath`: report path where to upload, if not specified last folder name from `filePath` is used
- `options`: additional properties object, optional
  - `exclude`: array of strings to exclude specified files paths, names or extensions
  - `overwrite`: overrites reports and datasources on upload, default true
  - `deleteExistingItems`: delete before upload, default false
  - `fixDataSourceReference`: fix uploaded reports datasource references with uploaded datasources, default true 
  - `dataSourceOptions`: each dataSourceName and its connection properties
    - `dataSourceName`: 
      - `connectstring`: connection string for data source
      - `userName`: userName for data source
      - `password`: password for data source
      - name, prompt, security, extension type is determined from the .rds and dataSourceOptions file      
  - `logger`: boolean, outputs to console
  - `logger`: object
    - `log`: log messages function
    - `warn`: log warrning/error messages function

  
## Contributors

 * Author: [vision10](https://github.com/vision10)