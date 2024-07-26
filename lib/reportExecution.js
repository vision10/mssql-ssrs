const dayjs = require('dayjs');
const utils = require('./utils');

module.exports = class ReportExecution {
    constructor() { }

    getClient() { return this.client }
    getDescription() { return this.client.describe() }

    async start(url, clientConfig, options, security) {
        try {
            this.soapInstance = utils.createSoapInstance(null, options);
            if (/^https?:/.test(url)) { url = url + '/ReportExecution2005.asmx' }
            this.client = await this.soapInstance.createClient(url, clientConfig, security);
            return this.client;
        } catch (err) { utils.errorHandler(err) }
    }

    async listRenderingExtensions() {
        try {
            const result = await this.client.ListRenderingExtensionsAsync();
            return result[0].Extensions.Extension;
        } catch (err) { utils.errorHandler(err) }
    }

    async #getImageForHtmlRendering(report) {
        const { Result: renderedReport, StreamIds } = report[0];
        
        // Retrieve and encode images in Base64
        const imagesBase64 = {};
        for (const streamId of StreamIds.string) {
            const imageData = await this.client.RenderStreamAsync({
                Format: 'HTML5',
                StreamID: streamId,
                DeviceInfo: '<DeviceInfo><HTMLFragment>true</HTMLFragment></DeviceInfo>'
            });
            const base64Image = imageData[0].Result.toString('base64');
            imagesBase64[streamId] = `data:image/png;base64,${base64Image}`;
        }
    
        // Convert from base64 to html
        let html = Buffer.from(renderedReport, 'base64').toString('utf8');

        // Replace image references in the HTML with Base64 data
        for (const [streamId, base64Image] of Object.entries(imagesBase64)) {
            const regex = new RegExp(`src="[^"]*ImageID=${streamId}"`, 'g');
            html = html.replace(regex, `src="${base64Image}"`);
        }

        report[0].Result = Buffer.from(html, 'utf8');

        return report;
    }

    async getReport(reportPath, fileType, params) {
        try {
            reportPath = utils.testReportPath(this.soapInstance.getRootFolder(), reportPath);
            fileType = utils.reportFileFormat(fileType);

            // Loads a report from the report server into a new execution.
            const execInfo = await this.client.LoadReportAsync({ Report: reportPath });

            // clear last headers and include executionId as soap header otherwise request fails
            // make shure somehow, header does not change from another request
            // would be nice to have headers for 1 specific request not global
            const executionHeader = { ExecutionHeader: { ExecutionID: execInfo[0].executionInfo.ExecutionID } };
            const xmlns = 'http://schemas.microsoft.com/sqlserver/2005/06/30/reporting/reportingservices';

            this.client.clearSoapHeaders();
            const index = this.client.addSoapHeader(executionHeader, '', 'h', xmlns);
            const header = this.client.getSoapHeaders()[index]; // keep for later
            // Sets and validates parameter values associated with the current report execution.
            await this.client.SetExecutionParametersAsync({
                Parameters: { ParameterValue: this.formatParameters(params) },
                ExecutionDateTime: new Date() // set start of ExecutionTime
            });

            this.client.clearSoapHeaders();
            this.client.addSoapHeader(header); // skip processing header again
            // Process and render loaded report in the specified format.
            let result = await this.client.RenderAsync({ Format: fileType });

            if(fileType === 'HTML5') {
                result = await this.#getImageForHtmlRendering(result);
            }

            this.client.clearSoapHeaders();
            
            return result;
        } catch (err) {
            this.client.clearSoapHeaders();
            utils.errorHandler(err);
        }
    }

    /**
     * parameters must be formated like => [{ Name: name, Value: value }]
     * 
     * for params with multivalue 
     * [{ Name: sameName, Value: [] }] =>
     * 
     * [{ Name: sameName, Value: value1 }, { Name: sameName, Value: value2 }]
     * 
     * name value is case sensitive
     */
    formatParameters(params) {
        return Array.isArray(params) ? this.arrayToReport(params) : this.objectToReport(params)
    }

    /**
     * [{ Name: nume, Value: valoare }]
     */
    arrayToReport(params, checkNulls) {
        const formated = [];
        for (var i = 0; i < params.length; i++) {
            if (params[i].ParameterTypeName === "DateTime" || params[i].Value instanceof Date) {
                formated.push({
                    Name: params[i].Name,
                    Value: dayjs(params[i].Value).format("MM/DD/YYYY")
                })
            } else if ((params[i].AllowBlank === true || params[i].Nullable === true) && (!params[i].Value || params[i].Value === undefined)) {
                formated.push({
                    Name: params[i].Name,
                    Value: undefined
                })
            } else if (checkNulls && (!params[i].AllowBlank || !params[i].Nullable) && (!params[i].Value || params[i].Value === undefined)) {
                throw `Parameter ${params[i].Name} cannot be undefined!`
            } else if (Array.isArray(params[i].Value)) {
                if (!params[i].Value.length)
                    formated.push({ Name: params[i].Name, Value: null })
                if (params[i].Value.length === 1 && params[i].Value[0] === "all validValues") {
                    for (var j = 0; j < params[i].ValidValues.ValidValue.length; j++) {
                        formated.push({
                            Name: params[i].Name,
                            Value: params[i].ValidValues.ValidValue[j].Value
                        })
                    }
                } else {
                    for (var j = 0; j < params[i].Value.length; j++) {
                        formated.push({
                            Name: params[i].Name,
                            Value: params[i].Value[j]
                        })
                    }
                }
            } else {
                formated.push({ Name: params[i].Name, Value: params[i].Value })
            }
        }
        return formated;
    }

    /**
     * object params { [name]: value }
     * 
     * for multivalue { [name]: [value1, value2] } =>
     * 
     * return [{ Name: sameField, Value: value1 }, { Name: sameField, Value: value2 }]
     */
    objectToReport(params) {
        const formated = [];
        for (var key in params) {
            if (params[key] instanceof Date && !isNaN(params[key].valueOf())) {
                formated.push({ Name: key, Value: dayjs(params[key]).format("MM/DD/YYYY") })
            } else if (Array.isArray(params[key])) {
                if (!params[key].length) {
                    formated.push({ Name: params[key], Value: undefined })
                } else {
                    for (var i = 0; i < params[key].length; i++) {
                        formated.push({ Name: key, Value: params[key][i] })
                    }
                }
            } else {
                formated.push({ Name: key, Value: params[key] === null ? undefined : params[key] })
            }
        }
        return formated;
    }
}