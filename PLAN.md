帮我修改prompts.ts提示词文件，将该Agent功能从单纯的代码Agent改造为API全生命周期管理Agent。
API全生命周期管理涵盖API设计、API代码实现，API发布三大核心环节。
其中API设计主要功能为通过自然语言修改API定义。每次修改完，都要基于结果做diff让用户二次确认。
API实现主要通过API定义生成对应的代码接口实现，如Controller，这部分需要复用原有的代码生成能力，不要重新造轮子。
API发布主要功能是将API定义发布到API网关使其定义生效。

此次新增的工具的调用信息swagger描述如下：

``` json

{
  "swagger": "2.0",
  "info": {
    "description": "API文档",
    "version": "1.0",
    "title": "API文档"
  },
  "host": "127.0.0.1:7001",
  "basePath": "/",
  "tags": [
    {
      "name": "测试",
      "description": "Test Controller"
    },
    {
      "name": "账号管理",
      "description": "Aliyun Account Controller"
    }
  ],
  "paths": {
    "/test/edit_api": {
      "post": {
        "tags": [
          "测试"
        ],
        "summary": "修改API",
        "operationId": "editApiUsingPOST",
        "consumes": [
          "application/json"
        ],
        "produces": [
          "*/*"
        ],
        "parameters": [
          {
            "name": "apiName",
            "in": "query",
            "description": "apiName",
            "required": true,
            "type": "string"
          },
          {
            "name": "changeDescription",
            "in": "query",
            "description": "changeDescription",
            "required": true,
            "type": "string"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "schema": {
              "$ref": "#/definitions/Result«Map»"
            }
          },
          "201": {
            "description": "Created"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not Found"
          }
        },
        "deprecated": false
      }
    },
    "/test/get_api": {
      "post": {
        "tags": [
          "测试"
        ],
        "summary": "获取API",
        "operationId": "getApiUsingPOST",
        "consumes": [
          "application/json"
        ],
        "produces": [
          "*/*"
        ],
        "parameters": [
          {
            "name": "apiName",
            "in": "query",
            "description": "apiName",
            "required": true,
            "type": "string"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "schema": {
              "$ref": "#/definitions/Result«Map»"
            }
          },
          "201": {
            "description": "Created"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not Found"
          }
        },
        "deprecated": false
      }
    },
    "/test/publish_api": {
      "post": {
        "tags": [
          "测试"
        ],
        "summary": "发布API",
        "operationId": "publishApiUsingPOST",
        "consumes": [
          "application/json"
        ],
        "produces": [
          "*/*"
        ],
        "parameters": [
          {
            "name": "apiName",
            "in": "query",
            "description": "apiName",
            "required": true,
            "type": "string"
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "schema": {
              "$ref": "#/definitions/Result«Void»"
            }
          },
          "201": {
            "description": "Created"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not Found"
          }
        },
        "deprecated": false
      }
    }
  },
  "definitions": {
    "AliyunTestAccountInfoVO": {
      "type": "object",
      "properties": {
        "accessKey": {
          "type": "string"
        },
        "accountId": {
          "type": "string"
        },
        "accountName": {
          "type": "string"
        },
        "accountSecret": {
          "type": "string"
        },
        "accountType": {
          "type": "string"
        },
        "empId": {
          "type": "string"
        },
        "isActivated": {
          "type": "boolean"
        },
        "isDeleted": {
          "type": "boolean"
        },
        "nickName": {
          "type": "string"
        },
        "product": {
          "type": "string"
        },
        "productLine": {
          "type": "string"
        },
        "secretKey": {
          "type": "string"
        },
        "securePhone": {
          "type": "string"
        }
      },
      "title": "AliyunTestAccountInfoVO",
      "description": "页面展示的账号信息"
    },
    "ApiDTO": {
      "type": "object",
      "properties": {
        "apiExtConfigDTO": {
          "$ref": "#/definitions/ApiExtConfigDTO"
        },
        "bizId": {
          "type": "integer",
          "format": "int64"
        },
        "bizType": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "gmtCreate": {
          "type": "string",
          "format": "date-time"
        },
        "gmtModified": {
          "type": "string",
          "format": "date-time"
        },
        "id": {
          "type": "integer",
          "format": "int64"
        },
        "isRelativeResource": {
          "type": "integer",
          "format": "int32"
        },
        "method": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "operation": {
          "$ref": "#/definitions/Operation"
        },
        "path": {
          "type": "string"
        },
        "rawPath": {
          "type": "string"
        },
        "status": {
          "type": "string"
        },
        "type": {
          "type": "string"
        },
        "uuid": {
          "type": "string"
        },
        "visibility": {
          "type": "string"
        }
      },
      "title": "ApiDTO"
    },
    "ApiExtConfigDTO": {
      "type": "object",
      "properties": {
        "enableHoz": {
          "type": "boolean"
        },
        "enableWordCheck": {
          "type": "boolean"
        }
      },
      "title": "ApiExtConfigDTO"
    },
    "CreateAliyunTestAccountParamVO": {
      "type": "object",
      "properties": {
        "accountName": {
          "type": "string"
        },
        "accountType": {
          "type": "string"
        },
        "operator": {
          "type": "string"
        },
        "product": {
          "type": "string"
        },
        "productLine": {
          "type": "string"
        }
      },
      "title": "CreateAliyunTestAccountParamVO",
      "description": "申请账号所需参数"
    },
    "ExternalDocs": {
      "type": "object",
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string"
        }
      },
      "title": "ExternalDocs"
    },
    "Map«string,List«string»»": {
      "type": "object",
      "title": "Map«string,List«string»»",
      "additionalProperties": {
        "$ref": "#/definitions/List"
      }
    },
    "Model": {
      "type": "object",
      "properties": {
        "description": {
          "type": "string"
        },
        "example": {
          "type": "object"
        },
        "externalDocs": {
          "$ref": "#/definitions/ExternalDocs"
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/Property"
          }
        },
        "reference": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "vendorExtensions": {
          "type": "object"
        }
      },
      "title": "Model"
    },
    "Operation": {
      "type": "object",
      "properties": {
        "consumes": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "deprecated": {
          "type": "boolean"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/ExternalDocs"
        },
        "operationId": {
          "type": "string"
        },
        "parameters": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Parameter"
          }
        },
        "produces": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "responses": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/Response"
          }
        },
        "schemes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "http",
              "https",
              "ws",
              "wss"
            ]
          }
        },
        "security": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Map«string,List«string»»"
          }
        },
        "summary": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "title": "Operation"
    },
    "Parameter": {
      "type": "object",
      "properties": {
        "description": {
          "type": "string"
        },
        "in": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "pattern": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean"
        },
        "required": {
          "type": "boolean"
        },
        "vendorExtensions": {
          "type": "object"
        }
      },
      "title": "Parameter"
    },
    "Property": {
      "type": "object",
      "properties": {
        "allowEmptyValue": {
          "type": "boolean"
        },
        "description": {
          "type": "string"
        },
        "example": {
          "type": "object"
        },
        "format": {
          "type": "string"
        },
        "position": {
          "type": "integer",
          "format": "int32"
        },
        "readOnly": {
          "type": "boolean"
        },
        "title": {
          "type": "string"
        },
        "type": {
          "type": "string"
        },
        "vendorExtensions": {
          "type": "object"
        },
        "xml": {
          "$ref": "#/definitions/Xml"
        }
      },
      "title": "Property"
    },
    "Response": {
      "type": "object",
      "properties": {
        "description": {
          "type": "string"
        },
        "examples": {
          "type": "object"
        },
        "headers": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/Property"
          }
        },
        "responseSchema": {
          "$ref": "#/definitions/Model"
        },
        "schema": {
          "$ref": "#/definitions/Property"
        }
      },
      "title": "Response"
    },
    "Result«ApiDTO»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "$ref": "#/definitions/ApiDTO"
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«ApiDTO»"
    },
    "Result«List«AliyunTestAccountInfoVO»»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/AliyunTestAccountInfoVO"
          }
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«List«AliyunTestAccountInfoVO»»"
    },
    "Result«List«string»»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«List«string»»"
    },
    "Result«Map»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "type": "object"
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«Map»"
    },
    "Result«Void»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«Void»"
    },
    "Result«boolean»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "type": "boolean"
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«boolean»"
    },
    "Result«object»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "type": "object"
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«object»"
    },
    "Result«string»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "type": "string"
        },
        "message": {
          "type": "string"
        },
        "pageNum": {
          "type": "integer",
          "format": "int32"
        },
        "pageSize": {
          "type": "integer",
          "format": "int32"
        },
        "requestId": {
          "type": "string"
        },
        "total": {
          "type": "integer",
          "format": "int64"
        }
      },
      "title": "Result«string»"
    },
    "Xml": {
      "type": "object",
      "properties": {
        "attribute": {
          "type": "boolean"
        },
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "wrapped": {
          "type": "boolean"
        }
      },
      "title": "Xml"
    }
  }
}


```



