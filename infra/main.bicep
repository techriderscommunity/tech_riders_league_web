targetScope = 'subscription'

param location string = 'northeurope'
param environmentName string = 'league-test-f22a'
param deployDatabase bool = true
param bootstrapEnabled bool = false

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: {
    application: 'League'
    environment: 'test'
  }
}

module resources 'modules/league.bicep' = {
  name: '${environmentName}-resources'
  scope: group
  params: {
    location: location
    environmentName: environmentName
    deployDatabase: deployDatabase
    bootstrapEnabled: bootstrapEnabled
  }
}

output resourceGroupName string = group.name
output webAppName string = resources.outputs.webAppName
output webUrl string = resources.outputs.webUrl
output databaseHost string = resources.outputs.databaseHost
