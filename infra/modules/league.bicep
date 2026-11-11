param location string
param environmentName string
param deployDatabase bool
param bootstrapEnabled bool

var appSubnetPrefix = '10.42.0.0/26'
var databaseSubnetPrefix = '10.42.1.0/27'
var databaseName = 'league'
var databaseHost = 'pg-${environmentName}.postgres.database.azure.com'
var commonTags = {
  application: 'League'
  environment: 'test'
}

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: 'asp-${environmentName}'
  location: location
  tags: commonTags
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${environmentName}'
  location: location
  tags: commonTags
}

resource migrationIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (deployDatabase) {
  name: 'id-migrate-${environmentName}'
  location: location
  tags: commonTags
}

resource databaseNsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'nsg-db-${environmentName}'
  location: location
  tags: commonTags
  properties: {
    securityRules: [
      {
        name: 'AllowLeaguePostgreSQL'
        properties: {
          priority: 100
          access: 'Allow'
          direction: 'Inbound'
          protocol: 'Tcp'
          sourceAddressPrefix: appSubnetPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: databaseSubnetPrefix
          destinationPortRange: '5432'
        }
      }
      {
        name: 'AllowPostgreSQLInternal'
        properties: {
          priority: 110
          access: 'Allow'
          direction: 'Inbound'
          protocol: '*'
          sourceAddressPrefix: databaseSubnetPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: databaseSubnetPrefix
          destinationPortRange: '*'
        }
      }
      {
        name: 'DenyOtherVirtualNetwork'
        properties: {
          priority: 300
          access: 'Deny'
          direction: 'Inbound'
          protocol: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-${environmentName}'
  location: location
  tags: commonTags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.42.0.0/16']
    }
    subnets: [
      {
        name: 'app'
        properties: {
          addressPrefix: appSubnetPrefix
          delegations: [
            { name: 'web', properties: { serviceName: 'Microsoft.Web/serverFarms' } }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: databaseSubnetPrefix
          networkSecurityGroup: { id: databaseNsg.id }
          serviceEndpoints: [{ service: 'Microsoft.Storage', locations: [location] }]
          delegations: [
            { name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }
          ]
        }
      }
    ]
  }
}

resource dns 'Microsoft.Network/privateDnsZones@2024-06-01' = if (deployDatabase) {
  name: '${environmentName}.postgres.database.azure.com'
  location: 'global'
  tags: commonTags
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = if (deployDatabase) {
  parent: dns
  name: 'league'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: network.id }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = if (deployDatabase) {
  name: 'pg-${environmentName}'
  location: location
  tags: commonTags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '18'
    createMode: 'Default'
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenant().tenantId
    }
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      publicNetworkAccess: 'Disabled'
      delegatedSubnetResourceId: '${network.id}/subnets/postgres'
      privateDnsZoneArmResourceId: dns.id
    }
  }
  dependsOn: [dnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = if (deployDatabase) {
  parent: postgres
  name: databaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

module databaseAdmin 'administrator.bicep' = if (deployDatabase) {
  name: 'database-admin'
  params: {
    serverName: postgres.name
    principalId: migrationIdentity!.properties.principalId
    principalName: migrationIdentity.name
  }
}

resource requireTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = if (deployDatabase) {
  parent: postgres
  name: 'require_secure_transport'
  properties: { value: 'on', source: 'user-override' }
}

resource app 'Microsoft.Web/sites@2024-11-01' = {
  name: 'app-${environmentName}'
  location: location
  tags: commonTags
  kind: 'app,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: union({
      '${runtimeIdentity.id}': {}
    }, deployDatabase && bootstrapEnabled ? {
      '${migrationIdentity.id}': {}
    } : {})
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    virtualNetworkSubnetId: '${network.id}/subnets/app'
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      alwaysOn: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      remoteDebuggingEnabled: false
      vnetRouteAllEnabled: false
      appCommandLine: deployDatabase ? 'node scripts/azure-initialize.mjs && node scripts/migrate.mjs && node scripts/verify-azure-database.mjs && npm start -- --hostname 0.0.0.0' : ''
      appSettings: concat([
        { name: 'NODE_ENV', value: 'production' }
        { name: 'PORT', value: '8080' }
        { name: 'APP_URL', value: 'https://app-${environmentName}.azurewebsites.net' }
        { name: 'REGISTRATION_ENABLED', value: 'false' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'ENABLE_ORYX_BUILD', value: 'true' }
        { name: 'NPM_CONFIG_PRODUCTION', value: 'false' }
        { name: 'AZURE_CLIENT_ID', value: runtimeIdentity.properties.clientId }
      ], deployDatabase ? [
        { name: 'DATABASE_URL', value: 'postgresql://${runtimeIdentity.name}@${databaseHost}:5432/${databaseName}' }
        { name: 'DATABASE_AUTH', value: 'managed-identity' }
        { name: 'DATABASE_SSL', value: 'true' }
        { name: 'DATABASE_USER', value: runtimeIdentity.name }
        { name: 'DATABASE_PRINCIPAL_ID', value: runtimeIdentity.properties.principalId }
      ] : [], deployDatabase && bootstrapEnabled ? [
        { name: 'MIGRATION_CLIENT_ID', value: migrationIdentity!.properties.clientId }
        { name: 'MIGRATION_DATABASE_USER', value: migrationIdentity.name }
      ] : [])
    }
  }
  dependsOn: [database, databaseAdmin, requireTls]
}

resource disableScmPasswords 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}

resource disableFtpPasswords 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}

output webAppName string = app.name
output webUrl string = 'https://${app.properties.defaultHostName}'
output databaseHost string = deployDatabase ? databaseHost : ''
