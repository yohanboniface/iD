iD.operations.ImproveWay = function(selection, context) {
    var entityId = selection[0];

    var operation = function() {
        context.enter(iD.modes.ImproveWay(context, entityId));
    };

    operation.available = function() {
        return selection.length === 1 &&
            context.entity(entityId).type === 'way';
    };

    operation.enabled = function() {
        return true;
    };

    operation.id = "improve";
    operation.key = t('operations.improve.key');
    operation.title = t('operations.improve.title');
    operation.description = t('operations.improve.description');

    return operation;
};
