const utils = require('./utils');
const ReportExecution = require('./reportExecution');

module.exports = class ReportService {
    constructor() { }

    getClient() { return this.client }
    getDescription() { return this.client.describe() }

    async start(url, clientConfig, options, security) {
        try {
            this.soapInstance = await utils.createSoapInstance(null, options);
            if (/^https?:/.test(url)) {
                url = url + `/ReportService201${options && options.useRs2012 ? '2' : '0'}.asmx`
            }
            this.client = await this.soapInstance.createClient(url, clientConfig, security);
            return this.client;
        } catch (err) { utils.errorHandler(err) }
    }

    async listChildren(reportPath, isRecursive) {
        try {
            const reports = await this.client.ListChildrenAsync({
                ItemPath: reportPath,
                Recursive: isRecursive
            });
            return reports[0].CatalogItems && reports[0].CatalogItems.CatalogItem;
        } catch (err) { utils.errorHandler(err) }
    }

    async getReportParams(reportPath, forRendering) {
        try {
            const result = await this.client.GetItemParametersAsync({
                ItemPath: reportPath,
                ForRendering: forRendering || false
            });
            return result[0].Parameters && result[0].Parameters.ItemParameter;
        } catch (err) { utils.errorHandler(err) }
    }

    async updateReportParams(reportPath, params, formatParams) {
        try {
            if (formatParams) { params = (new ReportExecution()).formatParameters(params) }
            const result = await this.client.GetItemParametersAsync({
                ItemPath: reportPath, ForRendering: true,
                Values: { ParameterValue: params },
            });
            return result[0].Parameters && result[0].Parameters.ItemParameter;
        } catch (err) { utils.errorHandler(err) }
    }

    // all DataSourceDefinition properties
    // https://msdn.microsoft.com/en-us/library/reportservice2010.datasourcedefinition%28v=sql.120%29.aspx
    async testDataSourceConnection(userName, password, dataSourceDefinition) {
        try {
            const result = await this.client.TestConnectForDataSourceDefinitionAsync({
                DataSourceDefinition: dataSourceDefinition,
                UserName: userName,
                Password: password,
            });
            // throw error on ConnectError ????
            if (result[0].TestConnectForDataSourceDefinitionResult) {
                return result[0].TestConnectForDataSourceDefinitionResult
            }
            return result[0].ConnectError
        } catch (err) { utils.errorHandler(err) }
    }

    async getProperties(reportPath, properties) {
        try {
            let props = [];
            if (properties) {
                if (typeof properties[0] === 'string') {
                    for (var i = 0; i < properties.length; i++) { props.push({ Name: properties[i] }) }
                    // props = properties.map(function (p) { return { Name: p } });
                } else { props = properties }
            }

            // properties = [{ Name: 'Hidden' }, { Name: 'Description' }]
            const args = { ItemPath: reportPath };
            if (props.length) { args.Properties = { Property: props } }
            const result = await this.client.GetPropertiesAsync(args);
            return result[0].Values.Property;
        } catch (err) { utils.errorHandler(err) }
    }

    async setProperties(reportPath, properties) {
        try {
            let props = [];
            if (!Array.isArray(properties)) {
                for (var key in properties)
                    props.push({ Name: key, Value: properties[key] })
            } else { props = properties }

            // properties = [{ Name: 'Hidden', Value: true }, { Name: 'Description', Value: true }]
            const result = this.client.SetPropertiesAsync({
                ItemPath: reportPath,
                Properties: { Property: props }
            });
            return result[0]
        } catch (err) { utils.errorHandler(err) }
    }

    async listJobs() {
        try {
            const jobs = await client.ListJobsAsync();
            return jobs[0].Jobs;
        } catch (err) { utils.errorHandler(err) }
    }

    async cancelJob(jobId) {
        if (!jobId) { throw new Error("Job id required!") }
        try {
            const result = await this.client.CancelJobAsync({ JobId: jobId });
            return result[0].Jobs;
        } catch (err) { utils.errorHandler(err) }
    }

    async getItemDefinition(reportPath) {
        try {
            const rdl = await this.client.GetItemDefinitionAsync({ ItemPath: reportPath });
            return Buffer.from(rdl[0].Definition, 'base64').toString().replace(/\0/g, '');
        } catch (error) { utils.errorHandler(error) }
    }

    async deleteItem(path) {
        try {
            const result = await this.client.DeleteItemAsync({ ItemPath: path });
            return result[0]
        } catch (error) { utils.errorHandler(error) }
    }

    async createFolder(folderName, path) {
        try {
            const result = await this.client.CreateFolderAsync({ Folder: folderName, Parent: path });
            return result[0];
        } catch (error) { utils.errorHandler(error) }
    }

    async createDataSource(dataSourceName, folder, overwrite, definition, description, isHidden) {
        try {
            const result = await this.client.CreateDataSourceAsync({
                Parent: folder, // The fully qualified URL for the parent folder that will contain the data source.
                DataSource: dataSourceName, // The name for the data source including the file name and, in SharePoint mode, the extension (.rsds).
                Overwrite: overwrite || false, // indicates whether an existing data source with the same name in the location specified should be overwritten.
                Definition: definition, // A DataSourceDefinition object that describes the connection properties for the data source.
                Properties: { // An array of Property objects that defines the property names and values to set for the data source.
                    Property: [
                        { Name: 'Description', Value: description },
                        { Name: 'Hidden', Value: isHidden || false }
                    ]
                },
            })
            return result[0].ItemInfo;
        } catch (error) { utils.errorHandler(error) }
    }

    async createReport(reportName, folder, overwrite, definition, description, isHidden) {
        try {
            const newReport = await this.client.CreateCatalogItemAsync({
                ItemType: 'Report',
                Parent: folder,
                Name: reportName,
                Overwrite: overwrite || false,
                Definition: Buffer.from(definition).toString('base64'),
                Properties: {
                    Property: [
                        { Name: 'Description', Value: description },
                        { Name: 'Hidden', Value: isHidden || false }
                    ]
                }
            });
            return newReport[0].ItemInfo;
        } catch (error) { utils.errorHandler(error) }
    }

    async createResource(name, path, fileContents, overwrite, mimeType) {
        try {
            const resource = await this.client.CreateCatalogItemAsync({
                ItemType: 'Resource',
                Parent: path,
                Name: name,
                Overwrite: overwrite,
                Definition: fileContents,
                Properties: {
                    Property: [{ Name: 'MimeType', Value: mimeType }]
                }
            });
            return resource[0].ItemInfo;
        } catch (error) { utils.errorHandler(error) }
    }

    async setItemDataSources(itemPath, dataSources) {
        try {
            const ds = [];
            if (Array.isArray(dataSources)) {
                ds.push(...dataSources);
            } else {
                for (var key in dataSources)
                    ds.push({ Name: key, DataSourceReference: { Reference: dataSources[key] } });
            }
            const result = await this.client.SetItemDataSourcesAsync({
                ItemPath: itemPath,
                DataSources: { DataSource: ds }
            });
            return result[0];
        } catch (error) { utils.errorHandler(error) }
    }

    async getItemDataSources(itemPath) {
        try {
            const result = await this.client.GetItemDataSourcesAsync({ ItemPath: itemPath });
            return result[0].DataSources.DataSource;
        } catch (error) { utils.errorHandler(error) }
    }

    async getItemReferences(itemPath, referenceItemType) {
        try {
            const result = await this.client.GetItemReferencesAsync({
                ItemPath: itemPath,
                ReferenceItemType: referenceItemType
            });
            return result[0].ItemReferences && result[0].ItemReferences.ItemReferenceData || [];
        } catch (error) { utils.errorHandler(error) }
    }

    async setItemReferences(itemPath, itemReferences) {
        try {
            const result = await this.client.SetItemReferencesAsync({
                ItemPath: itemPath,
                ItemReferences: { ItemReference: itemReferences }
            });
            return result[0];
        } catch (error) { utils.errorHandler(error) }
    }
}
