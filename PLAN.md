帮我修改prompts.ts提示词文件和功能代码，将该Agent功能从单纯的代码Agent改造为API全生命周期管理Agent。
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
    }
  ],
  "paths": {
    "/test/edit_api": {
      "post": {
        "tags": [
          "测试"
        ],
        "summary": "修改并获取修改后的API",
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
              "$ref": "#/definitions/Result«UpdateMeta»"
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
    },
    "/test/update_api": {
      "post": {
        "tags": [
          "测试"
        ],
        "summary": "更新API",
        "operationId": "updateApiUsingPOST",
        "consumes": [
          "application/json"
        ],
        "produces": [
          "*/*"
        ],
        "parameters": [
          {
            "name": "apiMeta",
            "in": "query",
            "description": "apiMeta",
            "required": true,
            "type": "string"
          },
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
    "Result«UpdateMeta»": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string"
        },
        "data": {
          "$ref": "#/definitions/UpdateMeta"
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
      "title": "Result«UpdateMeta»"
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
    "UpdateMeta": {
      "type": "object",
      "properties": {
        "after": {
          "type": "object",
          "description": "修改后的API元数据"
        },
        "before": {
          "type": "object",
          "description": "修改前的API元数据"
        }
      },
      "title": "UpdateMeta"
    }
  }
}

```



