import { DTDefinition } from '~types/dataTypes';

const definition: DTDefinition = {
	fieldGroup: 'other',
	fieldGroupOrder: 20,
	dependencies: [
		'Alphanumeric', 'AutoIncrement', 'Boolean', 'City', 'Company', 'Computed', 'Constant', 'Country', 'Currency',
		'CVV', 'Date', 'Email', 'GUID', 'IBAN', 'LatLng', 'List', 'Names', 'NormalDistribution', 'NumberRange',
		'OrganizationNumber', 'PAN', 'PersonalNumber', 'Phone', 'PIN', 'PostalZip', 'Region', 'Rut', 'SIRET',
		'StreetAddress', 'TextFixed', 'TextRandom', 'Track1', 'Track2'
	],
	schema: {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: 'object',
		properties: {
			placeholder: {
				type: 'string'
			}
		},
		required: [
			'placeholder'
		]
	}
};

export default definition;
