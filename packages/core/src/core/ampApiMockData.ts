/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


export const listApisData = {
  "data": [
    "getBill",
    "TestHsfApi010",
    "ModifyInstanceDeployment",
    "OfflineTest",
    "MergeTest01",
    "DuhePreVeiwApi",
    "TestReleaseMaster",
    "duhe_tes_new_api",
    "StopInstances",
    "DescribeImageSupportInstanceTypes",
    "DescribeEniMonitorData",
    "ModifyImageShareGroupPermission",
    "Demo111",
    "ModifyManagedInstance",
    "TestHsfApi005",
    "DescribeSendFileResults",
    "DeleteInstances",
    "BackRollRename",
    "ModifyInstanceMetadataOptions",
    "ReportInstancesStatus",
    "TestAba",
    "ReleaseStatusTest",
    "CreateNew2",
    "StartTerminalSession",
    "TestForRerlease",
    "DescribeInstancesFullStatus",
    "DescribeManagedInstances",
    "HasUserRolesCheckV2",
    "TestHttpACopy01",
    "ImportImage",
    "DescribeInstanceTopology",
    "DescribeInstanceMaintenanceAttributes",
    "ReleaseFromV2Test",
    "DescribeInstanceModificationPrice",
    "Create1130Test",
    "RenewInstance",
    "RebootInstances",
    "DescribeUserData",
    "ExportImage",
    "ReActivateInstances",
    "DescribeInstanceMonitorData",
    "UpdateBill",
    "ReleaseTest",
    "TestHsfApiCopy",
    "ReleaseTest2",
    "ConvertNatPublicIpToEip",
    "AllocatePublicIpAddress",
    "StartInstances",
    "TestNewly",
    "DescribeCloudAssistantStatus",
    "TestHsfApi",
    "ModifyInstanceAttachmentAttributes",
    "LmzOne",
    "TestApiForRealesedCopy1",
    "DescribeRenewalPrice",
    "TestSls",
    "DescribeInstanceAutoRenewAttribute",
    "TestHsfApiCopy2",
    "DeleteKeyPairs",
    "CancelCopyImage",
    "DescribeImageSharePermission",
    "ImportKeyPair",
    "DeregisterManagedInstance",
    "GetInstanceConsoleOutput",
    "CreateInstance123",
    "TestHsfApiCopy0010",
    "CreateImage",
    "RedeployInstance",
    "DescribeInstanceAttribute",
    "TestApiForRealesed",
    "ModifyImageAttribute",
    "DescribeInstanceStatus",
    "OcsNewAPITest",
    "SendFile",
    "TestHsfApiOne",
    "GetInstanceScreenshot",
    "CreateNew",
    "InstallCloudAssistant",
    "RsTest",
    "TestGaryRelease2",
    "DeleteInstance",
    "TestPublish",
    "ModifyPrepayInstanceSpec",
    "RebootInstance",
    "RunInstances",
    "CopyImage"
  ],
  "requestId": "60a5f4e4-8cb2-466a-b982-de8263c8f670"
}


export const updateApiData = {
  "data": "123456789",
  "requestId": "4fcbaaa0-88a3-4da5-9e3c-2fb9cfa14195"
}

export const publishApiData = {
  "data": "123456789",
  "requestId": "4fcbaaa0-88a3-4da5-9e3c-2fb9cfa14195"
}



export const debugApiData =  {
  "data": {
    "request": {
      "queryParams": {
        "ServiceCode": "ECS",
        "PopCode": "Ecs"
      }
    },
    "response": {
      "bodyParams": {
        "PopVersion": "2014-05-26"
      }
    }
  },
  "requestId": "6b5be16c-e590-46e7-8ddd-8ef09e1a9dd7"
}



export const getApiData = {
  "data": {
    "alibabaCloud": "alibabaCloud:1.0.0",
    "info": {
      "runtimeType": "pop",
      "namespace": "amp-2::2014-05-26",
      "apiStyle": "rpc"
    },
    "apis": {
      "HasUserRolesCheckV2": {
        "summary": "查询用户是否有指定角色V2123",
        "methods": [
          "get"
        ],
        "schemes": [
          "https"
        ],
        "security": [
          {
            "Anonymous": []
          }
        ],
        "visibility": "Private",
        "deprecated": false,
        "gatewayOptions": {
          "outputParamVersion": 2,
          "showJsonItemName": false,
          "fileTransfer": false,
          "akProvenStatus": "Disable",
          "keepClientResourceOwnerId": false,
          "responseLog": true
        },
        "backendService": {
          "protocol": "http",
          "url": "http://127.0.0.1:8080/helloworld/simple/chat",
          "timeout": 10000,
          "retries": -1
        },
        "policies": {
          "rateLimitPolicy": {
            "unit": "Second",
            "apiRateLimit": 30
          },
          "controlPolicyName": "vpc_access"
        },
        "parameters": [
          {
            "name": "PopCode",
            "in": "formData",
            "schema": {
              "type": "string",
              "backendName": "popCode"
            }
          },
          {
            "name": "RoleEnum",
            "in": "formData",
            "schema": {
              "title": "ADMINISTRATOR: 角色类型, DEVELOPER, TEST_ENGINEER, DOC_ENGINEER, VISITOR, STABILITY_MANAGER, FIRST_APPROVER, SECOND_APPROVER, THIRD_APPROVER, FOURTH_APPROVER, SPECIAL_APPROVER, DOC_APPROVER",
              "type": "string",
              "backendName": "roleEnum"
            }
          },
          {
            "name": "EmpId",
            "in": "formData",
            "schema": {
              "type": "string",
              "backendName": "empId"
            }
          }
        ],
        "responses": {
          "200": {
            "schema": {
              "title": "BaseResponse<Boolean>",
              "type": "object",
              "properties": {
                "RequestId": {
                  "title": "请求ID",
                  "type": "string",
                  "backendName": "requestId"
                },
                "Data": {
                  "title": "业务数据",
                  "type": "boolean",
                  "backendName": "data"
                }
              }
            }
          }
        },
        "errorMapping": {
          "errorExpression": "success=false",
          "codeField": "code",
          "errorMessageField": "message",
          "httpStatusCodeField": "httpStatusCode"
        },
        "variables": {
          "pre": {
            "$.backendService.version": "1.0.0"
          },
          "daily": {
            "$.backendService.version": "1.0.0.daily"
          }
        }
      }
    }
  },
  "requestId": "402091ab-982b-4ad7-a18c-7e6688aaa293"
} as const;

