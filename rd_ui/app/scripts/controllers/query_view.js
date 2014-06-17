(function() {
  'use strict';

  function QueryViewCtrl($scope, Events, $route, $location, notifications, growl, Query, DataSource, $http, $routeParams) {
    var DEFAULT_TAB = 'table';

    $scope.query = $route.current.locals.query;
    Events.record(currentUser, 'view', 'query', $scope.query.id);
    $scope.queryResult = $scope.query.getQueryResult();
    $scope.queryExecuting = false;

    $scope.filterList = [
      {'desc':'Time Range', 'query':'WHERE created_at >= (CURRENT_DATE + interval \'7 hours\' - 1) AND created_at < (CURRENT_DATE + interval \'7 hours\')'},
      {'desc':'Ad Campaign', 'query':'WHERE ad_campaign_id = 11'},
      {'desc':'Bundle ID', 'query':'WHERE bundle_id = \'com.xyz.abc\''},
      {'desc':'Publisher ID', 'query':'WHERE ad_publisher_app_id = 2'},
      {'desc':'Join Pulisher', 'query':'JOIN ad_publisher_apps ON ad_events.ad_publisher_app_id = ad_publisher_apps.id'},
      {'desc':'Join Campaign', 'query':'JOIN ad_campaigns ON ad_events.ad_campaign_id = ad_campaigns.id'},
      {'desc':'Join Device', 'query':'JOIN client_devices ON ad_events.client_device_id = client_devices.id'},
      {'desc':'CTR', 'query':'SELECT (100 * CAST (click as real)) / cast (impression as real) from (select sum(case when event=\'session\' then 1 else 0 end) as "click", sum(case when event=\'impression\' then 1 else 0 end) as "impression" from ad_events)'},
      {'desc':'Install Rate', 'query':'SELECT (100 * CAST (install as real)) / cast (impression as real) from (select sum(case when event=\'store\' then 1 else 0 end) as "install", sum(case when event=\'impression\' then 1 else 0 end) as "impression" from ad_events)'},
      {'desc':'Bucket over days', 'query':'SELECT count(*), date (convert_timezone(\'PDT\', created_at)) FROM ad_events GROUP BY 2 ORDER BY 2 DESC'},
      {'desc':'Bucket over hours', 'query':'SELECT count(*), date_trunc(\'hour\', created_at) FROM ad_events GROUP BY 2 ORDER BY 2 DESC'},
    ]

    $scope.templateList = [
      {'desc':'performance for specific bundle+campaign', 'query':'SELECT date, impression, click, store, ' +
                                                                  '      (click*1.0 / impression) AS "CTR", (store*1.0 / impression) AS "install" ' +
                                                                  'FROM (SELECT date (convert_timezone(\'PDT\', created_at)), ' +
                                                                  '     sum(CASE WHEN event=\'impression\' THEN 1 ELSE 0 END) AS "impression",' +
                                                                  '          sum(CASE WHEN event=\'click\' THEN 1 ELSE 0 END) AS "click",' +
                                                                  '          sum(CASE WHEN event=\'store\' THEN 1 ELSE 0 END) AS "store"' +
                                                                  '   FROM ad_events' +
                                                                  '   WHERE ad_campaign_id = FILL_CAMPAIGN_ID_HERE' +
                                                                  '     AND bundle_id = \'FILL_BUNDLE_ID_HERE\'' +
                                                                  '   GROUP BY 1' +
                                                                  '   ORDER BY 1 DESC)'},
    ]

    $scope.isQueryOwner = currentUser.id === $scope.query.user.id;
    $scope.canViewSource = currentUser.hasPermission('view_source');

    $scope.dataSources = DataSource.get(function(dataSources) {
      $scope.query.data_source_id = $scope.query.data_source_id || dataSources[0].id;
    });

    $scope.addTemplate = function(template) {
      $scope.query.query = $scope.query.query + '\n' + template['query']
      $scope.queryExecuting = true;
      $http.post('/api/queries/format', {
          'query': $scope.query.query
      }).success(function (response) {
          $scope.query.query = response;
      }).finally(function () {
        $scope.queryExecuting = false;
      });
    }

    $scope.lockButton = function(lock) {
      $scope.queryExecuting = lock;
    };

    $scope.saveQuery = function(options, data) {
      if (data) {
        data.id = $scope.query.id;
      } else {
        data = $scope.query;
      }

      options = _.extend({}, {
        successMessage: 'Query saved',
        errorMessage: 'Query could not be saved'
      }, options);

      delete $scope.query.latest_query_data;
      delete $scope.query.queryResult;

      return Query.save(data, function() {
        growl.addSuccessMessage(options.successMessage);
      }, function(httpResponse) {
        growl.addErrorMessage(options.errorMessage);
      }).$promise;
    }

    $scope.saveDescription = function() {
      Events.record(currentUser, 'edit_description', 'query', $scope.query.id);
      $scope.saveQuery(undefined, {'description': $scope.query.description});
    };

    $scope.saveName = function() {
      Events.record(currentUser, 'edit_name', 'query', $scope.query.id);
      $scope.saveQuery(undefined, {'name': $scope.query.name});
    };

    $scope.executeQuery = function() {
      $scope.queryResult = $scope.query.getQueryResult(0);
      $scope.lockButton(true);
      $scope.cancelling = false;
      Events.record(currentUser, 'execute', 'query', $scope.query.id);
    };

    $scope.cancelExecution = function() {
      $scope.cancelling = true;
      $scope.queryResult.cancelExecution();
      Events.record(currentUser, 'cancel_execute', 'query', $scope.query.id);
    };

    $scope.updateDataSource = function() {
      Events.record(currentUser, 'update_data_source', 'query', $scope.query.id);

      $scope.query.latest_query_data = null;
      $scope.query.latest_query_data_id = null;

      if ($scope.query.id) {
        Query.save({
          'id': $scope.query.id,
          'data_source_id': $scope.query.data_source_id,
          'latest_query_data_id': null
        });
      }

      $scope.executeQuery();
    };

    $scope.setVisualizationTab = function (visualization) {
      $scope.selectedTab = visualization.id;
      $location.hash(visualization.id);
    };

    $scope.$watch('query.name', function() {
      $scope.$parent.pageTitle = $scope.query.name;
    });

    $scope.$watch('queryResult && queryResult.getError()', function(newError, oldError) {
      if (newError == undefined) {
        return;
      }

      if (oldError == undefined && newError != undefined) {
        $scope.lockButton(false);
      }
    });

    $scope.$watch('queryResult && queryResult.getData()', function(data, oldData) {
      if (!data) {
        return;
      }

      $scope.filters = $scope.queryResult.getFilters();
    });

    $scope.$watch("queryResult && queryResult.getStatus()", function(status) {
      if (!status) {
        return;
      }

      if (status == "done") {
        if ($scope.query.id &&
          $scope.query.latest_query_data_id != $scope.queryResult.getId() &&
          $scope.query.query_hash == $scope.queryResult.query_result.query_hash) {
          Query.save({
            'id': $scope.query.id,
            'latest_query_data_id': $scope.queryResult.getId()
          })
        }
        $scope.query.latest_query_data_id = $scope.queryResult.getId();

        notifications.showNotification("re:dash", $scope.query.name + " updated.");

        $scope.lockButton(false);
      }
    });

    $scope.$watch(function() {
      return $location.hash()
    }, function(hash) {
      if (hash == 'pivot') {
        Events.record(currentUser, 'pivot', 'query', $scope.query && $scope.query.id);
      }
      $scope.selectedTab = hash || DEFAULT_TAB;
    });

    var campaign_id = $routeParams.campaign_id
    var bundle_id = $routeParams.bundle_id
    var tmp = $scope.query.query;
    if (typeof campaign_id !== 'undefined') {
      tmp = tmp.replace("FILL_CAMPAIGN_ID_HERE", campaign_id)
    }
    if (typeof bundle_id !== 'undefined') {
      tmp = tmp.replace("FILL_BUNDLE_ID_HERE", bundle_id)
    }
    if (tmp !== $scope.query.query) {
      $scope.query.query = tmp
      $scope.executeQuery();
    }

  };

  angular.module('redash.controllers')
    .controller('QueryViewCtrl',
      ['$scope', 'Events', '$route', '$location', 'notifications', 'growl', 'Query', 'DataSource', '$http', '$routeParams', QueryViewCtrl]);
})();
