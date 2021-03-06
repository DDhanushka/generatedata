import utils from '../../../utils';
import { DTGenerateResult, DTGenerationData, DTGenerationExistingRowData } from '~types/dataTypes';

let utilsLoaded = false;

export const generate = (data: DTGenerationData): DTGenerateResult => {
	const placeholders: any = {};

	data.existingRowData.forEach((row: DTGenerationExistingRowData) => {
		placeholders[`ROW${row.colIndex+1}`] = row.data.display;
	});

	return {
		display: utils.generalUtils.template(data.rowState.value, placeholders)
	};
};

const onmessage = (e: any) => {
	if (!utilsLoaded) {
		importScripts(e.data.workerResources.workerUtils);
		utilsLoaded = true;
	}

	postMessage(generate(e.data));
};

export {};
